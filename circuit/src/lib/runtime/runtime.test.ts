import { describe, expect, it } from "vitest";
import { STARTER_PROGRAM } from "@/lib/blocks/starter";
import { blocklyToProgram, formatIssues, parseProgram, type Program, type WorkspaceState } from "@/lib/ir";
import { mockAdapters } from "./adapters";
import { begin, finish, trigger } from "./engine";
import { simulateFor, type CircuitEvent } from "./events";
import type { RunResult, Trace } from "./interpreter";
import { Rng } from "./rng";
import { initialState, readState, type Receipt, type RuntimeState } from "./state";
import { isRef } from "./values";

const program = (scripts: unknown[]): Program => {
  const r = parseProgram({ version: 1, scripts });
  if (!r.ok) throw new Error(formatIssues(r.issues));
  return r.program;
};

interface Fired {
  receipts: Receipt[];
  results: RunResult[];
  traces: Trace[];
  raised: CircuitEvent[];
}

/** Simulates the event for script `index` and runs every script it triggers. */
async function fire(state: RuntimeState, prog: Program, index = 0, seed = 7): Promise<Fired> {
  const rng = new Rng(seed);
  const now = () => 1_000_000;
  const event = simulateFor(prog.scripts[index].event, state, rng, now());
  const out: Fired = { receipts: [], results: [], traces: [], raised: [] };
  for (const match of trigger(state, prog, event, rng)) {
    const { receipt, run } = begin(state, match, { rng, adapters: mockAdapters(rng), now, raise: (e) => out.raised.push(e) });
    let r = await run.next();
    while (!r.done) {
      out.traces.push(r.value);
      r = await run.next();
    }
    finish(state, receipt, r.value, now());
    out.receipts.push(receipt);
    out.results.push(r.value);
  }
  return out;
}

const texts = (r: Receipt) => r.entries.map((e) => e.text);

describe("interpreter", () => {
  it("runs the starter program: variables, nested IF/ELSE and text interpolation", async () => {
    const r = parseProgram(blocklyToProgram(STARTER_PROGRAM as WorkspaceState));
    if (!r.ok) throw new Error(formatIssues(r.issues));
    const state = initialState(1);
    for (let i = 0; i < 4; i++) await fire(state, r.program);
    expect(state.feed.map((f) => f.text)).toEqual(["Click 1", "Click 2", "Three clicks! Resetting.", "Click 1"]);
    expect(state.variables.clicks).toBe(1);
    expect(state.runs).toHaveLength(4);
    expect(state.runs.every((x) => x.status === "complete")).toBe(true);
  });

  it("yields once per executed statement, with the block id and stack", async () => {
    const prog = program([
      {
        event: { type: "button", id: "hat" },
        body: [
          { type: "set_var", id: "s1", var: "x", value: 2 },
          { type: "if", id: "if1", condition: { type: "compare", a: { type: "var", var: "x" }, op: "gt", b: 1 }, then: [{ type: "change_var", id: "c1", var: "x", by: 10 }], else: [{ type: "reset_var", id: "r1", var: "x" }] },
        ],
      },
    ]);
    const state = initialState(1);
    const { traces, results } = await fire(state, prog);
    expect(results[0].status).toBe("complete");
    expect(traces.map((t) => t.id)).toEqual(["s1", "if1", "c1"]);
    const inner = traces[2];
    expect(inner.kind === "step" && inner.stack.map((f) => f.id)).toEqual(["if1", "c1"]);
    expect(state.variables.x).toBe(12);
  });

  it("stops runaway loops at the step cap", async () => {
    const prog = program([
      { event: { type: "button" }, body: [{ type: "repeat", times: 1000, do: [{ type: "change_var", var: "n", by: 1 }] }] },
    ]);
    const state = initialState(1);
    const { results, receipts } = await fire(state, prog);
    expect(results[0].status).toBe("step_limit");
    expect(receipts[0].status).toBe("step_limit");
    expect(state.variables.n).toBeLessThan(500);
  });

  it("creates persistent agents, buys (simulated) and adds them to the world", async () => {
    const prog = program([
      {
        event: { type: "volume_milestone", amount: 10 },
        body: [
          { type: "create_agent", speciesMode: "random_from_list", species: "penguin, otter", var: "agent" },
          { type: "set_var", var: "asset", value: { type: "random_item", list: ["NVDA", "TSLA", "AAPL"] } },
          { type: "sim_buy", asset: { type: "var", var: "asset" }, amount: 0.03, unit: "SOL" },
          { type: "add_to_world", item: { type: "var", var: "agent" } },
        ],
      },
    ]);
    const state = initialState(1);
    const { receipts } = await fire(state, prog);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe("complete");
    expect(state.market.totalVolume).toBeGreaterThanOrEqual(10);
    expect(state.agents).toHaveLength(1);
    const agent = state.agents[0];
    expect(["penguin", "otter"]).toContain(agent.species);
    expect(agent.inWorld).toBe(true);
    expect(isRef(state.variables.agent, "agent")).toBe(true);
    expect(state.treasury.SOL).toBeCloseTo(4.97);
    expect(Object.values(state.portfolio)).toEqual([0.03]);
    const buy = receipts[0].entries.find((e) => e.op === "SIM_BUY")!;
    expect(buy.simulated).toBe(true);
    expect(texts(receipts[0])).toContain("World updated");
  });

  it("halts with an error receipt when the treasury can't cover a transfer", async () => {
    const prog = program([
      {
        event: { type: "button" },
        body: [
          { type: "sim_transfer", id: "t", amount: 100, unit: "SOL", to: "wallet" },
          { type: "set_var", var: "after", value: "ran" },
        ],
      },
    ]);
    const state = initialState(1);
    const { results } = await fire(state, prog);
    expect(results[0].status).toBe("error");
    expect(results[0].errorBlockId).toBe("t");
    expect(results[0].error).toMatch(/Insufficient treasury/);
    expect(state.variables.after).toBeUndefined();
    expect(state.treasury.SOL).toBe(5);
  });

  it("fires volume milestones only when a multiple is crossed", async () => {
    const prog = program([
      { event: { type: "volume_milestone", amount: 10 }, body: [{ type: "increment_var", var: "m" }] },
      { event: { type: "trade", side: "any_side" }, body: [{ type: "increment_var", var: "t" }] },
    ]);
    const state = initialState(1);
    await fire(state, prog, 0); // crosses 10: both scripts run
    expect(state.variables).toMatchObject({ m: 1, t: 1 });
    await fire(state, prog, 1); // small trade: no new milestone
    expect(state.variables).toMatchObject({ m: 1, t: 2 });
  });

  it("STOP ends the script; WAIT yields a wait trace", async () => {
    const prog = program([
      {
        event: { type: "button" },
        body: [
          { type: "wait", seconds: 2 },
          { type: "if", condition: true, then: [{ type: "stop", scope: "all_scripts" }] },
          { type: "set_var", var: "x", value: 1 },
        ],
      },
    ]);
    const state = initialState(1);
    const { results, traces } = await fire(state, prog);
    expect(traces.some((t) => t.kind === "wait" && t.seconds === 2)).toBe(true);
    expect(results[0]).toMatchObject({ status: "stopped", stopAll: true });
    expect(state.variables.x).toBeUndefined();
  });

  it("RUN AGENT stores the result, remembers and raises agent-completes", async () => {
    const prog = program([
      {
        event: { type: "button" },
        body: [
          { type: "create_agent", nameMode: "manual", name: "Nori", var: "agent" },
          { type: "run_agent", agent: { type: "var", var: "agent" }, task: "find odd sites", resultVar: "result" },
        ],
      },
    ]);
    const state = initialState(1);
    const { raised, results } = await fire(state, prog);
    expect(results[0].status).toBe("complete");
    expect(String(state.variables.result)).toContain("Nori");
    expect(state.agents[0].memory).toEqual(["Task: find odd sites"]);
    expect(raised).toHaveLength(1);
    expect(raised[0].type).toBe("agent_completes");
  });

  it("reads event fields and interpolates {event.x} and {variables}", async () => {
    const prog = program([
      {
        event: { type: "creator_fees" },
        body: [
          { type: "set_var", var: "fees", value: { type: "event_field", field: "amount" } },
          { type: "update_feed", message: "Fees {fees} / {event.amount}" },
        ],
      },
    ]);
    const state = initialState(1);
    await fire(state, prog);
    const fees = state.variables.fees as number;
    expect(fees).toBeGreaterThan(0);
    expect(state.treasury.SOL).toBeCloseTo(5 + fees);
    expect(state.feed[0].text).toBe(`Fees ${fees} / ${fees}`);
  });

  it("explains a missing agent instead of crashing", async () => {
    const prog = program([{ event: { type: "button" }, body: [{ type: "agent_remember", memory: "hi", agent: null }] }]);
    const { results } = await fire(initialState(1), prog);
    expect(results[0].status).toBe("error");
    expect(results[0].error).toMatch(/No agent here/);
  });
});

describe("runtime state persistence", () => {
  it("round-trips through JSON and marks interrupted runs", () => {
    const state = initialState(3);
    state.variables.score = 4;
    state.runs.push({ id: 1, startedAt: 1, finishedAt: null, event: { type: "button", label: "x", source: "simulator", data: {} }, status: "running", error: null, steps: 0, entries: [] });
    const back = readState(JSON.stringify(state))!;
    expect(back.variables.score).toBe(4);
    expect(back.runs[0].status).toBe("stopped");
  });

  it("falls back per field on damaged saves, and rejects non-state", () => {
    const back = readState(JSON.stringify({ version: 1, seed: 9, treasury: "oops", variables: { a: 1 } }))!;
    expect(back.treasury).toEqual({ SOL: 5, USDC: 250 });
    expect(back.variables).toEqual({ a: 1 });
    expect(readState("not json")).toBeNull();
    expect(readState(JSON.stringify({ hello: 1 }))).toBeNull();
  });
});
