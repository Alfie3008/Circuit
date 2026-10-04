/**
 * Glue between events, executions and receipts. UI-free, so the same flow
 * runs in tests, in the browser controller, and later on a server.
 *
 *   trigger(state, program, event) → matches (one per triggered script)
 *   begin(state, match)            → receipt + generator for that script
 *   finish(state, receipt, result) → receipt closed and stored
 */
import type { Program } from "@/lib/ir";
import type { Adapters } from "./adapters";
import { applyEvent, dispatch, type CircuitEvent, type Match } from "./events";
import { runScript, type RunContext, type RunResult, type Trace } from "./interpreter";
import type { Rng } from "./rng";
import { MAX_RUNS, trimWorld, type Receipt, type RuntimeState } from "./state";

/** Applies an event to the simulated world and returns the scripts it triggers. */
export function trigger(state: RuntimeState, program: Program, event: CircuitEvent, rng: Rng): Match[] {
  const before = applyEvent(state, event, rng);
  return dispatch(program, event, before, state.market);
}

export interface Begun {
  receipt: Receipt;
  run: AsyncGenerator<Trace, RunResult>;
}

/** Opens a receipt for a triggered script and returns its paced generator. */
export function begin(
  state: RuntimeState,
  match: Match,
  opts: { rng: Rng; adapters: Adapters; source?: string; now?: () => number; maxSteps?: number; raise?: RunContext["raise"]; rules?: string; coin?: string },
): Begun {
  const now = opts.now?.() ?? Date.now();
  state.executionCount += 1;
  const receipt: Receipt = {
    id: state.executionCount,
    startedAt: now,
    finishedAt: null,
    event: {
      type: match.script.event.type,
      label: match.label,
      source: opts.source ?? match.event.source,
      data: match.payload,
      ...(match.event.proof ? { proof: match.event.proof } : {}),
    },
    hatId: match.script.event.id,
    status: "running",
    error: null,
    steps: 0,
    entries: [{ op: match.script.event.type.toUpperCase(), blockId: match.script.event.id, text: match.label, details: [], status: "ok" }],
    ...(opts.rules ? { rules: opts.rules } : {}),
  };
  state.runs.push(receipt);
  if (state.runs.length > MAX_RUNS) state.runs.splice(0, state.runs.length - MAX_RUNS);
  const run = runScript(match.script, {
    state,
    rng: opts.rng,
    adapters: opts.adapters,
    receipt,
    payload: match.payload,
    now: opts.now,
    maxSteps: opts.maxSteps,
    raise: opts.raise,
    coin: opts.coin,
  });
  return { receipt, run };
}

export function finish(state: RuntimeState, receipt: Receipt, result: Pick<RunResult, "status" | "error" | "steps">, now = Date.now()) {
  receipt.status = result.status;
  receipt.error = result.error;
  receipt.steps = result.steps;
  receipt.finishedAt = now;
  trimWorld(state);
}
