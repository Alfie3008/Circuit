/**
 * Backtest: "if this program had been running, what would it have done?"
 *
 * Replays events (a real token's past trades, or a simulated day) through the
 * program on a FRESH runtime state, at full speed, with mock AI so it costs
 * nothing. The user's real state is never touched.
 */
import type { Program } from "@/lib/ir";
import { mockAdapters, type AiAdapter } from "@/lib/runtime/adapters";
import { begin, finish, trigger } from "@/lib/runtime/engine";
import type { CircuitEvent } from "@/lib/runtime/events";
import { Rng } from "@/lib/runtime/rng";
import { initialState, type Receipt } from "@/lib/runtime/state";
import { toNumber } from "@/lib/runtime/values";

/** Rough per-call price of a runtime AI block (Haiku-class model). */
export const AI_COST_PER_CALL_USD = 0.001;
/** pump.fun creator share of each trade on the bonding curve. */
export const CREATOR_FEE_RATE = 0.003;
/** Executions one event (with what it raises) may cause, as in the live runtime. */
const MAX_CHAIN = 25;

export interface TimelinePoint {
  t: number;
  amount: number;
  side: "buy" | "sell";
  /** Scripts this trade triggered (empty if none). */
  ran: string[];
  explorer?: string;
}

export interface BacktestResult {
  events: number;
  trades: number;
  executions: number;
  errors: number;
  agentsCreated: number;
  feedPosts: number;
  aiCalls: number;
  volumeSol: number;
  estAiCostUsd: number;
  estCreatorFeesSol: number;
  /** One point per trade, oldest first. */
  timeline: TimelinePoint[];
  /** The most recent receipts (newest last). */
  receipts: Receipt[];
  /** Why nothing ran, when nothing did. */
  note: string | null;
}

/** Wraps an AI adapter to count calls. */
function counting(ai: AiAdapter): { ai: AiAdapter; count: () => number } {
  let n = 0;
  const wrap = <F extends (...a: never[]) => Promise<unknown>>(f: F) =>
    ((...a: Parameters<F>) => {
      n++;
      return f(...a);
    }) as F;
  return {
    ai: {
      label: "mock (backtest)",
      ask: wrap(ai.ask),
      structured: wrap(ai.structured),
      choose: wrap(ai.choose),
      classify: wrap(ai.classify),
      summarize: wrap(ai.summarize),
      identity: wrap(ai.identity),
      decide: wrap(ai.decide),
      generateText: wrap(ai.generateText),
      review: wrap(ai.review),
      runAgent: wrap(ai.runAgent),
    },
    count: () => n,
  };
}

export async function backtest(
  program: Program,
  events: CircuitEvent[],
  opts: { seed?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<BacktestResult> {
  const state = initialState(opts.seed ?? 7);
  const rng = new Rng(opts.seed ?? 7);
  const base = mockAdapters(rng);
  const counted = counting(base.ai);
  const adapters = { ...base, ai: counted.ai };
  const timeline: TimelinePoint[] = [];
  let executions = 0;
  let errors = 0;

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    const point: TimelinePoint | null =
      event.type === "trade"
        ? { t: event.timestamp, amount: toNumber(event.data.amount), side: event.data.side === "sell" ? "sell" : "buy", ran: [], explorer: event.proof?.explorer }
        : null;
    const queue: CircuitEvent[] = [event];
    let chain = 0;
    while (queue.length && chain < MAX_CHAIN) {
      const now = queue[0].timestamp;
      for (const match of trigger(state, program, queue.shift()!, rng)) {
        if (++chain > MAX_CHAIN) break;
        const { receipt, run } = begin(state, match, { rng, adapters, now: () => now, raise: (e) => queue.push(e) });
        let r = await run.next();
        while (!r.done) r = await run.next();
        finish(state, receipt, r.value, now);
        executions++;
        if (r.value.status === "error" || r.value.status === "step_limit") errors++;
        point?.ran.push(match.label);
      }
    }
    if (point) timeline.push(point);
    if (i % 25 === 0) {
      opts.onProgress?.(i + 1, sorted.length);
      await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
    }
  }
  opts.onProgress?.(sorted.length, sorted.length);

  const volumeSol = timeline.reduce((s, p) => s + p.amount, 0);
  const aiCalls = counted.count();
  const hats = new Set(program.scripts.map((s) => s.event.type));
  const note =
    executions > 0
      ? null
      : program.scripts.length === 0
        ? "The program has no event blocks, so nothing could run."
        : `None of the program's events (${[...hats].join(", ").replace(/_/g, " ")}) happened in this window.`;

  return {
    events: sorted.length,
    trades: timeline.length,
    executions,
    errors,
    agentsCreated: state.agents.length,
    feedPosts: state.feed.length,
    aiCalls,
    volumeSol: Math.round(volumeSol * 1000) / 1000,
    estAiCostUsd: Math.round(aiCalls * AI_COST_PER_CALL_USD * 1000) / 1000,
    estCreatorFeesSol: Math.round(volumeSol * CREATOR_FEE_RATE * 1e4) / 1e4,
    timeline,
    receipts: state.runs.slice(-30),
    note,
  };
}

/**
 * A plausible trading day for a young pump.fun coin: bursts and lulls, mostly
 * small trades, buys outnumbering sells, occasional fee claims. For trying a
 * backtest without an RPC; marked as simulated.
 */
export function simulatedHistory(hours: number, seed = 42, end = Date.now()): CircuitEvent[] {
  const rng = new Rng(seed);
  const start = end - hours * 3600_000;
  const events: CircuitEvent[] = [];
  let t = start;
  while (t < end) {
    // Bursty arrivals: mostly 1–6 minutes apart, sometimes a burst of quick trades.
    t += rng.next() < 0.25 ? rng.int(5, 40) * 1000 : rng.int(60, 360) * 1000;
    if (t >= end) break;
    const size = Math.round(Math.min(25, 0.05 + -Math.log(1 - rng.next()) * 0.9) * 1000) / 1000;
    events.push({ type: "trade", source: "simulator", timestamp: t, data: { amount: size, side: rng.next() < 0.62 ? "buy" : "sell", wallet: "sim…" } });
    if (rng.next() < 0.03) events.push({ type: "creator_fees", source: "simulator", timestamp: t + 1, data: { amount: rng.range(0.05, 0.4), wallet: "creator" } });
  }
  return events;
}
