import * as Blockly from "blockly/core";
import { beforeAll, describe, expect, it } from "vitest";
import { BLOCKS, getBlockSpec } from ".";
import { toBlocklyJson } from "./blocklyJson";
import { CATEGORIES } from "./categories";
import { HIDE_FIELDS_EXTENSION, registerExtensions } from "./extensions";
import { STARTER_PROGRAM } from "./starter";
import { buildToolbox, toolboxEntry, variablesFlyout } from "./toolbox";
import type { InputSpec } from "./types";

/** Toolbox entry as Blockly block state (drops the toolbox-only `kind`). */
const stateOf = (spec: (typeof BLOCKS)[number]): Blockly.serialization.blocks.State => {
  const { type, inputs, fields } = toolboxEntry(spec);
  return { type, inputs, fields } as Blockly.serialization.blocks.State;
};

describe("block registry", () => {
  it("has unique block types prefixed by their category", () => {
    const types = BLOCKS.map((b) => b.type);
    expect(new Set(types).size).toBe(types.length);
    for (const b of BLOCKS) expect(b.type.startsWith(`${b.category}_`), b.type).toBe(true);
  });

  it("has unique field/input names within each block", () => {
    for (const b of BLOCKS) {
      const names = b.rows.flatMap((r) => r.items).flatMap((i) => ("name" in i ? [i.name] : []));
      expect(new Set(names).size, b.type).toBe(names.length);
    }
  });

  it("fills every category", () => {
    for (const c of CATEGORIES) expect(BLOCKS.some((b) => b.category === c.id), c.id).toBe(true);
  });

  it("only references defined blocks as input defaults", () => {
    for (const b of BLOCKS)
      for (const item of b.rows.flatMap((r) => r.items))
        if (item.kind === "value" && item.default) expect(getBlockSpec(item.default.type), `${b.type}.${item.name}`).toBeDefined();
  });

  it("declares event outputs on every hat", () => {
    for (const b of BLOCKS.filter((b) => b.shape === "hat")) expect(b.eventOutputs?.length, b.type).toBeGreaterThan(0);
  });

  it("contains no project-specific primitives", () => {
    const banned = new Set(["rat", "longcat", "nvda", "nutty", "spawn", "capybara", "squirrel", "wake"]);
    for (const b of BLOCKS) for (const word of b.type.split("_")) expect(banned.has(word), b.type).toBe(false);
  });

  it("marks every simulated block's tooltip SIMULATED", () => {
    for (const b of BLOCKS.filter((b) => b.simulated)) expect(b.tooltip, b.type).toMatch(/SIMULATED/);
  });
});

describe("Blockly integration (headless)", () => {
  let ws: Blockly.Workspace;

  beforeAll(() => {
    registerExtensions();
    Blockly.common.defineBlocksWithJsonArray(BLOCKS.map(toBlocklyJson));
  });

  const fresh = () => {
    ws?.dispose();
    ws = new Blockly.Workspace();
    return ws;
  };

  it("instantiates every toolbox entry with its default inputs", () => {
    const w = fresh();
    for (const spec of BLOCKS) {
      const block = Blockly.serialization.blocks.append(stateOf(spec), w);
      expect(block.type).toBe(spec.type);
      // Every default actually connected (type checks passed).
      const defaults = spec.rows
        .flatMap((r) => r.items)
        .filter((i): i is Extract<InputSpec, { kind: "value" }> => i.kind === "value" && !!i.default);
      for (const d of defaults) expect(block.getInputTargetBlock(d.name), `${spec.type}.${d.name}`).not.toBeNull();
    }
  });

  it("round-trips the whole library through JSON serialization", () => {
    const w = fresh();
    for (const spec of BLOCKS) {
      Blockly.serialization.blocks.append(stateOf(spec), w);
    }
    const first = Blockly.serialization.workspaces.save(w);
    const w2 = fresh();
    Blockly.serialization.workspaces.load(first, w2);
    expect(Blockly.serialization.workspaces.save(w2)).toEqual(first);
  });

  it("loads the starter program with nested IF/ELSE intact", () => {
    const w = fresh();
    Blockly.serialization.workspaces.load(STARTER_PROGRAM, w);
    const top = w.getTopBlocks(false);
    expect(top).toHaveLength(1);
    const ifBlock = w.getAllBlocks(false).find((b) => b.type === "control_if_else")!;
    expect(ifBlock.getInputTargetBlock("CONDITION")?.type).toBe("logic_compare");
    expect(ifBlock.getInputTargetBlock("THEN")?.type).toBe("world_update_feed");
    expect(ifBlock.getInputTargetBlock("ELSE")?.type).toBe("world_update_feed");
    expect(w.getVariableMap().getVariable("clicks")).toBeTruthy();
  });

  it("rejects type-incompatible connections", () => {
    const w = fresh();
    const fits = (parent: string, input: string, child: string) =>
      w.connectionChecker.doTypeChecks(w.newBlock(parent).getInput(input)!.connection!, w.newBlock(child).outputConnection!);
    expect(fits("control_if", "CONDITION", "data_number")).toBe(false);
    expect(fits("control_if", "CONDITION", "logic_compare")).toBe(true);
    expect(fits("agents_run", "AGENT", "data_text")).toBe(false);
    expect(fits("agents_run", "AGENT", "agents_random")).toBe(true);
    expect(fits("agents_run", "AGENT", "variables_get")).toBe(true);
  });

  it("hides a text box while its mode is AI generated, keeping the value", () => {
    const w = fresh();
    const agent = w.newBlock("agents_create");
    expect(toBlocklyJson(getBlockSpec("agents_create")!).extensions).toEqual([HIDE_FIELDS_EXTENSION]);
    expect(agent.getField("NAME")!.isVisible()).toBe(false); // default mode: AI generated
    agent.setFieldValue("manual", "NAME_MODE");
    expect(agent.getField("NAME")!.isVisible()).toBe(true);
    agent.setFieldValue("Bongo", "NAME");
    agent.setFieldValue("ai_generated", "NAME_MODE");
    expect(agent.getField("NAME")!.isVisible()).toBe(false);
    expect(agent.getFieldValue("NAME")).toBe("Bongo");
    // Species defaults to "random from list" → list stays visible; visual hides for placeholder.
    expect(agent.getField("SPECIES")!.isVisible()).toBe(true);
    expect(agent.getField("VISUAL")!.isVisible()).toBe(false);
    agent.setFieldValue("emoji", "VISUAL_MODE");
    expect(agent.getField("VISUAL")!.isVisible()).toBe(true);
  });

  it("builds a toolbox with every category and a dynamic Variables flyout", () => {
    const tb = buildToolbox() as { contents: { name: string; custom?: string }[] };
    expect(tb.contents.map((c) => c.name)).toEqual(CATEGORIES.map((c) => c.name));
    expect(tb.contents.find((c) => c.name === "Variables")?.custom).toBe("CIRCUIT_VARIABLES");
    const flyout = variablesFlyout([{ id: "v1", name: "score" }]);
    expect(flyout.find((f) => f.kind === "button")).toMatchObject({ callbackkey: "CIRCUIT_CREATE_VARIABLE" });
    expect(flyout.filter((f) => "type" in f && f.type === "variables_get")).toHaveLength(1);
  });
});
