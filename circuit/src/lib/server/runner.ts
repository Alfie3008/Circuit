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
 * - AI spend: the project's daily USD cap and the server's (CIRCUIT_AI_DAILY_USD);
 *   past either, AI blocks get mock answers and the receipt says so
 */
import { AI_COST_PER_CALL_USD } from "@/lib/backtest/backtest";
import { chainProvider, getSolBalance } from "@/lib/chain/rpc";
import { aiConfigured, anthropicCaller, runtimeModel, type ModelCaller } from "@/lib/ai/model";
import { runOp } from "@/lib/ai/runtime";
import { mockAi, mockChain, mockWeb, type Adapters, type ChainAdapter } from "@/lib/runtime/adapters";
import { begin, finish, trigger } from "@/lib/runtime/engine";
import type { CircuitEvent } from "@/lib/runtime/events";
import { opAi } from "@/lib/runtime/remoteAi";
import { hash, Rng } from "@/lib/runtime/rng";
import { initialState, type RuntimeState } from "@/lib/runtime/state";
import { emptyMeta, type Db, type RunMeta, type ServerProject } from "./types";

const envNum = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const runLimits = () => ({
  runsPerMinute: envNum("CIRCUIT_RUNS_PER_MINUTE", 60),
  timeMs: envNum("CIRCUIT_RUN_TIME_MS", 20_000),
  serverAiDailyUsd: envNum("CIRCUIT_AI_DAILY_USD", 5),
  projectAiMaxUsd: envNum("CIRCUIT_AI_PROJECT_MAX_USD", 5),
});

/** Executions one event (with what it raises) may cause, as in the browser. */
const MAX_CHAIN = 25;
const MAX_ATTEMPTS = 3;
/** Longest a WAIT block really waits on the server (longer ones need a scheduler: later work). */
const MAX_WAIT_S = 10;

export const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

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
});

/** Real AI while the budgets allow, mock answers after. Counts real calls. */
function budgetedAi(base: Adapters["ai"], rng: Rng, call: ModelCaller | null, allowance: () => string | null, onCall: () => void) {
  if (!call) return { ai: base, real: false };
  const model = runtimeModel();
  const ai = opAi(mockAi(rng), model, async (op) => {
    const reason = allowance();
    if (reason) throw new Error(reason);
    onCall();
    return runOp(op, call, model);
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
      const state = row?.state ?? initialState(hash(projectId) % 2147483647);
      const meta: RunMeta = { ...emptyMeta(), ...(row?.meta ?? {}) };
      const ctx: RunContext = { project, state, meta, now: started };
      const metaBefore = JSON.stringify(meta);
      const events = Array.isArray(plan) ? plan : plan(ctx);
      if (!events.length) {
        // Nothing to run, but the planner may have moved timers or cursors.
        if (JSON.stringify(meta) === metaBefore || (await db.putState(projectId, state, meta, row?.version ?? 0))) return { ...summary, skipped: "no events" };
        continue;
      }

      // AI budget for today, read once per run.
      const day = today(started);
      let realCalls = 0;
      let used = { project: 0, server: 0 };
      const caller = opts.caller ?? (aiConfigured() ? anthropicCaller() : null);
      if (caller) {
        const [p, s] = await Promise.all([db.aiUsage(projectId, day), db.aiUsage(null, day)]);
        used = { project: p.usd, server: s.usd };
      }
      const projectCap = Math.min(project.aiDailyUsd, limits.projectAiMaxUsd);
      const allowance = () => {
        const spent = realCalls * AI_COST_PER_CALL_USD;
        if (used.server + spent + AI_COST_PER_CALL_USD > limits.serverAiDailyUsd) return "server's daily AI budget used";
        if (used.project + spent + AI_COST_PER_CALL_USD > projectCap) return "project's daily AI budget used";
        return null;
      };

      const rng = new Rng(state.seed);
      const base = opts.adapters?.(rng) ?? { ai: mockAi(rng), web: mockWeb(rng), chain: chainProvider() ? solanaChain() : mockChain() };
      const { ai } = budgetedAi(base.ai, rng, caller, allowance, () => realCalls++);
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
          for (const match of trigger(state, project.program, queue.shift()!, rng)) {
            if (++chain > MAX_CHAIN || window.runs >= limits.runsPerMinute) break;
            const { receipt, run } = begin(state, match, { rng, adapters, now: clock, raise: (e) => queue.push({ ...e, timestamp: clock() }) });
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
            executions++;
            window.runs++;
            if (r.value.status === "error" || r.value.status === "step_limit") errors++;
          }
        }
      }

      state.seed = rng.seed;
      meta.window = window;
      meta.dropped += dropped;
      meta.lastEventAt = sorted[sorted.length - 1].timestamp;
      meta.lastError = errors ? (state.runs.findLast((r) => r.error)?.error ?? null) : meta.lastError;

      if (realCalls) await db.addAiUsage(projectId, day, realCalls, realCalls * AI_COST_PER_CALL_USD);
      if (!(await db.putState(projectId, state, meta, row?.version ?? 0))) continue; // someone else wrote: redo on fresh state

      await db.addReceipts(projectId, state.runs.filter((r) => r.id > firstReceipt));
      return { projectId, events: sorted.length, executions, errors, dropped, aiCalls: realCalls };
    }
    return { ...summary, skipped: "busy (state kept changing)" };
  });
}
