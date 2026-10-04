/**
 * Runs a published project on the server: loads its world, feeds it events,
 * executes the scripts they trigger (same engine as the browser), and saves
 * the world and receipts back.
 *
 * Safety rails, so one project can't hurt the others or the bill:
 * - one run at a time per project (in-process lock + versioned writes, so two
 *   servers can't overwrite each other: the loser retries on fresh state)
 * - executions per project per minute (CIRCUIT_RUNS_PER_MINUTE, default 60);
 *   extra events are dropped and counted
 * - a time budget per invocation (CIRCUIT_RUN_TIME_MS, default 20 s)
 * - the engine's own step / repeat / chain caps per execution
 * - AI spend: the project's AI fuel (90% of the creator fees its coin has
 *   earned, minus what its AI already spent) and the server's daily ceiling
 *   (CIRCUIT_AI_DAILY_USD); past either, AI blocks get fallback answers and the
 *   receipt says so
 */
import { aiDailyCapUsd } from "@/lib/ai/spend";
import { AI_COST_PER_CALL_USD, fuelOf } from "@/lib/fuel";
import { rulesFingerprint } from "@/lib/proof/proof";
import { isAddress } from "@/lib/chain/parse";
import { chainProvider, getSolBalance, getTokenBalance } from "@/lib/chain/rpc";
import { aiConfigured, anthropicCaller, runtimeModel, type ModelCaller } from "@/lib/ai/model";
import { runOp } from "@/lib/ai/runtime";
import { mockAi, mockChain, type Adapters, type ChainAdapter } from "@/lib/runtime/adapters";
import { liveWeb } from "./web";
import { begin, finish, trigger } from "@/lib/runtime/engine";
import type { CircuitEvent } from "@/lib/runtime/events";
import { opAi } from "@/lib/runtime/remoteAi";
import { hash, Rng } from "@/lib/runtime/rng";
import { initialState, LIMITS, type Receipt, type RuntimeState } from "@/lib/runtime/state";
import { sizeOf } from "@/lib/runtime/values";
import { emptyMeta, type Db, type RunMeta, type ServerProject } from "./types";

const envNum = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const runLimits = () => ({
  runsPerMinute: envNum("CIRCUIT_RUNS_PER_MINUTE", 60),
  timeMs: envNum("CIRCUIT_RUN_TIME_MS", 20_000),
  serverAiDailyUsd: aiDailyCapUsd(),
});

/** Executions one event (with what it raises) may cause, as in the browser. */
const MAX_CHAIN = 25;
const MAX_ATTEMPTS = 3;
/** Longest a WAIT block really waits on the server (longer ones need a scheduler: later work). */
const MAX_WAIT_S = 10;

export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

/** A new world on the server: like the builder's, but the coin's numbers start at zero, not the simulator's samples. */
export function serverInitialState(projectId: string): RuntimeState {
  const s = initialState(hash(projectId) % 2147483647);
  s.market = { totalVolume: 0, marketCap: 0, holders: 0, trades: 0, ticks: 0 };
  return s;
}

export interface RunContext {
  project: ServerProject;
  state: RuntimeState;
  /** Mutable: changes are saved with the state. */
  meta: RunMeta;
  now: number;
}

/** Decides which events to run, from fresh state (inside the lock). */
export type Planner = (ctx: RunContext) => CircuitEvent[];

export interface RunSummary {
  projectId: string;
  events: number;
  executions: number;
  errors: number;
  dropped: number;
  aiCalls: number;
  /** Why nothing ran, if it didn't. */
  skipped?: string;
}

export interface RunOptions {
  now?: () => number;
  /** Replace the adapters (tests). */
  adapters?: (rng: Rng) => Adapters;
  /** Replace the model (tests); budgets still apply. */
  caller?: ModelCaller;
  /** Replace waiting (tests). */
  sleep?: (ms: number) => Promise<void>;
}

// --- per-project lock --------------------------------------------------------

const locks = new Map<string, Promise<unknown>>();

function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  const tail = next.catch(() => {});
  locks.set(id, tail);
  void tail.then(() => locks.get(id) === tail && locks.delete(id));
  return next;
}

// --- adapters ----------------------------------------------------------------

const solanaChain = (): ChainAdapter => ({
  label: "solana",
  balance: (wallet) => getSolBalance(wallet).catch(() => null),
  // Live coins only see real answers: a made-up wallet name is "can't read", not a guess.
  tokenBalance: (wallet, mint) => (isAddress(wallet) && isAddress(mint) ? getTokenBalance(wallet, mint).catch(() => null) : Promise.resolve(null)),
});

/** Real AI while the budgets allow, mock answers after. Reports each finished op. */
function budgetedAi(base: Adapters["ai"], rng: Rng, call: ModelCaller | null, allowance: () => string | null, onOp: () => void) {
  if (!call) return { ai: base, real: false };
  const model = runtimeModel();
  const ai = opAi(mockAi(rng), model, async (op) => {
    const reason = allowance();
    if (reason) throw new Error(reason);
    try {
      return await runOp(op, call, model);
    } finally {
      onOp(); // billed even if the answer was unusable
    }
  });
  return { ai, real: true };
}

// --- the run -----------------------------------------------------------------

export async function runProject(db: Db, projectId: string, plan: Planner | CircuitEvent[], opts: RunOptions = {}): Promise<RunSummary> {
  return withLock(projectId, async () => {
    const limits = runLimits();
    const clock = opts.now ?? Date.now;
    const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const started = clock();
    const summary: RunSummary = { projectId, events: 0, executions: 0, errors: 0, dropped: 0, aiCalls: 0 };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const project = await db.getProject(projectId);
      if (!project) return { ...summary, skipped: "not found" };
      if (!project.live) return { ...summary, skipped: "not live" };

      const row = await db.getState(projectId);
      const state = row?.state ?? serverInitialState(projectId);
      const meta: RunMeta = { ...emptyMeta(), ...(row?.meta ?? {}) };
      const ctx: RunContext = { project, state, meta, now: started };
      const metaBefore = JSON.stringify(meta);
      const events = Array.isArray(plan) ? plan : plan(ctx);
      if (!events.length) {
        // Nothing to run, but the planner may have moved timers or cursors.
        if (JSON.stringify(meta) === metaBefore || (await db.putState(projectId, state, meta, row?.version ?? 0))) return { ...summary, skipped: "no events" };
        continue;
      }

      // AI fuel and the server's ceiling, read once per run.
      const day = today(started);
      let realCalls = 0;
      let spentRun = 0;
      /** Real cost reported for the op in progress (the model may be called more than once per op). */
      let opCost = 0;
      let fuelLeft = 0;
      let serverUsed = 0;
      const caller = opts.caller ?? (aiConfigured() ? anthropicCaller({ onCost: (usd) => void (opCost += usd) }) : null);
      if (caller) {
        const [totals, s] = await Promise.all([db.fuelTotals(projectId), db.aiUsage(null, day)]);
        fuelLeft = fuelOf(totals).leftUsd;
        serverUsed = s.usd;
      }
      // The next call is assumed to cost the typical amount; what's already spent is the real cost.
      const allowance = () => {
        const spent = spentRun + AI_COST_PER_CALL_USD;
        if (spent > fuelLeft + 1e-9) return fuelLeft > 0 || project.setup.launchMode === "existing" ? "AI fuel is empty until the coin earns more creator fees" : "no coin connected, so no creator fees to pay for AI";
        if (serverUsed + spent > limits.serverAiDailyUsd + 1e-9) return "Circuit's daily AI limit is reached; back tomorrow";
        return null;
      };

      const rules = await rulesFingerprint(project.program);
      const rng = new Rng(state.seed);
      const base = opts.adapters?.(rng) ?? { ai: mockAi(rng), web: liveWeb(rng), chain: chainProvider() ? solanaChain() : mockChain() };
      const { ai } = budgetedAi(base.ai, rng, caller, allowance, () => {
        realCalls++;
        spentRun += opCost > 0 ? opCost : AI_COST_PER_CALL_USD; // test callers report no cost
        opCost = 0;
      });
      const adapters: Adapters = { ...base, ai };

      // Per-minute execution window.
      const minute = Math.floor(started / 60_000);
      const window = meta.window?.minute === minute ? meta.window : { minute, runs: 0 };
      const firstReceipt = state.executionCount;
      let executions = 0;
      let errors = 0;
      let dropped = 0;

      const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
      for (let i = 0; i < sorted.length; i++) {
        if (window.runs >= limits.runsPerMinute || clock() - started > limits.timeMs) {
          dropped = sorted.length - i;
          break;
        }
        const queue: CircuitEvent[] = [sorted[i]];
        let chain = 0;
        while (queue.length && chain < MAX_CHAIN) {
          // Failsafe: whatever goes wrong with one event is recorded, and the next one still runs.
          let open: Receipt | null = null;
          try {
            for (const match of trigger(state, project.program, queue.shift()!, rng)) {
              if (++chain > MAX_CHAIN || window.runs >= limits.runsPerMinute) break;
              const { receipt, run } = begin(state, match, { rng, adapters, now: clock, rules, coin: project.setup.tokenAddress || undefined, raise: (e) => queue.push({ ...e, timestamp: clock() }) });
              open = receipt;
              let r = await run.next();
              while (!r.done) {
                if (r.value.kind === "wait" && r.value.seconds > 0) {
                  const s = Math.min(r.value.seconds, MAX_WAIT_S, Math.max(0, (limits.timeMs - (clock() - started)) / 1000));
                  if (s < r.value.seconds)
                    receipt.entries.push({ op: "WAIT", blockId: r.value.id, text: `Server shortened a ${r.value.seconds}s wait to ${Math.round(s)}s`, details: [`Waits on the server are at most ${MAX_WAIT_S}s for now.`], status: "skipped" });
                  await sleep(s * 1000);
                }
                r = await run.next();
              }
              finish(state, receipt, r.value, clock());
              open = null;
              executions++;
              window.runs++;
              if (r.value.status === "error" || r.value.status === "step_limit") errors++;
            }
          } catch (e) {
            errors++;
            const detail = e instanceof Error ? e.message : String(e);
            meta.lastError = `An event couldn't be handled, so it was skipped: ${detail}`;
            if (open) {
              open.entries.push({ op: "ERROR", text: "Something went wrong, so this run stopped safely.", details: [`Detail: ${detail}`], status: "error" });
              finish(state, open, { status: "error", error: "Something went wrong, so this run stopped safely.", steps: open.steps }, clock());
            }
          }
        }
      }

      state.seed = rng.seed;
      // Last-resort failsafe: never save a world too big to load again. Keep the last good one.
      if (sizeOf(state, LIMITS.worldChars) > LIMITS.worldChars) {
        // `state` was changed in place, so read the stored (last good) copy again.
        const kept = (await db.getState(projectId))?.state ?? serverInitialState(projectId);
        const note = `These runs made the world too big to save (over ${(LIMITS.worldChars / 1e6).toFixed(0)} MB), so their changes were undone. Remove agents, entities or long lists, or reset the world.`;
        const fresh = state.runs.filter((r) => r.id > firstReceipt);
        for (const r of fresh) r.entries.push({ op: "ERROR", text: note, details: [], status: "error" });
        await db.addReceipts(projectId, fresh);
        kept.executionCount = state.executionCount;
        Object.assign(state, kept);
        meta.lastError = note;
      }
      meta.window = window;
      meta.dropped += dropped;
      meta.lastEventAt = sorted[sorted.length - 1].timestamp;
      meta.lastError = errors ? (state.runs.findLast((r) => r.id > firstReceipt && r.error)?.error ?? meta.lastError) : meta.lastError;

      if (realCalls) await db.addAiUsage(projectId, day, realCalls, spentRun);
      if (!(await db.putState(projectId, state, meta, row?.version ?? 0))) continue; // someone else wrote: redo on fresh state

      await db.addReceipts(projectId, state.runs.filter((r) => r.id > firstReceipt));
      return { projectId, events: sorted.length, executions, errors, dropped, aiCalls: realCalls };
    }
    return { ...summary, skipped: "busy (state kept changing)" };
  });
}
