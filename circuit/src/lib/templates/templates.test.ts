import { describe, expect, it } from "vitest";
import { programToBlockly } from "@/lib/ir";
import { mockAdapters } from "@/lib/runtime/adapters";
import { begin, finish, trigger } from "@/lib/runtime/engine";
import { presetEvent, type CircuitEvent, type PresetId } from "@/lib/runtime/events";
import { Rng } from "@/lib/runtime/rng";
import { initialState, type RuntimeState } from "@/lib/runtime/state";
import { getTemplate, TEMPLATES } from ".";

/** Fires a preset like the World panel does, running everything it triggers (including raised events). */
async function press(state: RuntimeState, id: string, preset: PresetId, rng = new Rng(11)) {
  const program = getTemplate(id)!.program;
  const queue: CircuitEvent[] = [presetEvent(preset, state, rng, 1)];
  const statuses: string[] = [];
  while (queue.length) {
    for (const match of trigger(state, program, queue.shift()!, rng)) {
      const { receipt, run } = begin(state, match, { rng, adapters: mockAdapters(rng), now: () => 1, raise: (e) => queue.push(e) });
      let r = await run.next();
      while (!r.done) r = await run.next();
      finish(state, receipt, r.value, 1);
      statuses.push(r.value.error ?? r.value.status);
    }
  }
  return statuses;
}

describe("templates", () => {
  it("all validate and convert to blocks", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["living-crew", "web-explorer", "autonomous-shopper", "creator-engine"]);
    for (const t of TEMPLATES) expect(programToBlockly(t.program).state.blocks?.blocks?.length).toBe(t.program.scripts.length);
  });

  it("Living Crew: +10 SOL makes a character that holds an asset and joins the world", async () => {
    const state = initialState(1);
    expect(await press(state, "living-crew", "volume10")).toEqual(["complete"]);
    const agent = state.agents[0];
    expect(["cat", "frog", "penguin", "raccoon", "dog", "capybara"]).toContain(agent.species);
    expect(agent.inWorld).toBe(true);
    expect(["NVDA", "TSLA", "AAPL", "META", "AMD"]).toContain(agent.custom.holdings);
    expect(state.feed[0].text).toBe(`${agent.name} joined the crew and bought ${agent.custom.holdings}`);
  });

  it("Web Explorer: fees fill the budget, then the explorer saves findings", async () => {
    const state = initialState(1);
    for (let i = 0; i < 6; i++) expect(await press(state, "web-explorer", "fees", new Rng(i + 1))).toEqual(["complete"]);
    expect(state.agents.map((a) => a.name)).toEqual(["Explorer"]);
    expect(state.collections.findings?.length).toBeGreaterThan(0);
    expect(state.budgets.computeBudget).toBeGreaterThanOrEqual(0);
  });

  it("Autonomous Shopper: buys onto the shelf once the budget allows", async () => {
    const state = initialState(1);
    for (let i = 0; i < 12; i++) expect(await press(state, "autonomous-shopper", "fees", new Rng(i + 1))).toEqual(["complete"]);
    expect(state.collections.shelf?.length).toBeGreaterThan(0);
    expect(state.entities.every((e) => e.type === "purchased item")).toBe(true);
    expect(state.agents).toHaveLength(1);
  });

  it("Creator Engine: 50 SOL opens a bounty and the submission is reviewed", async () => {
    const state = initialState(1);
    const statuses: string[] = [];
    for (let i = 0; i < 5; i++) statuses.push(...(await press(state, "creator-engine", "volume10", new Rng(i + 1))));
    expect(statuses).toEqual(["complete", "complete"]); // milestone script, then the raised submission
    const sub = state.bounties[0].submissions[0];
    expect(sub.score).not.toBeNull();
    expect(["rewarded", "rejected"]).toContain(sub.status);
  });
});
