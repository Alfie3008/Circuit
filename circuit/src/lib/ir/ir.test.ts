import * as Blockly from "blockly/core";
import { beforeAll, describe, expect, it } from "vitest";
import { BLOCKS } from "@/lib/blocks";
import { toBlocklyJson } from "@/lib/blocks/blocklyJson";
import { registerExtensions } from "@/lib/blocks/extensions";
import { STARTER_PROGRAM } from "@/lib/blocks/starter";
import { toolboxEntry } from "@/lib/blocks/toolbox";
import { formatList, formatPairs, parseList, parsePairs } from "./codecs";
import {
  blocklyToProgram,
  IR_VARIANTS,
  irKey,
  itemsOf,
  kindOf,
  META_KEYS,
  parseProgram,
  programJsonSchema,
  programToBlockly,
  resolveSpec,
  type Program,
  type WorkspaceState,
} from ".";

beforeAll(() => {
  registerExtensions();
  Blockly.common.defineBlocksWithJsonArray(BLOCKS.map(toBlocklyJson));
});

/** Load workspace JSON into a fresh headless workspace and save it back. */
function throughBlockly(state: WorkspaceState): WorkspaceState {
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(state as object, ws);
    return Blockly.serialization.workspaces.save(ws) as WorkspaceState;
  } finally {
    ws.dispose();
  }
}

function mustParse(input: unknown): Program {
  const r = parseProgram(input);
  if (!r.ok) throw new Error(JSON.stringify(r.issues, null, 2));
  return r.program;
}

/** Strip positions (assigned by layout when the input had none). */
const withoutPositions = (p: Program) => ({
  ...p,
  scripts: p.scripts.map((s) => ({ ...s, position: undefined })),
  loose: p.loose.map((l) => ({ ...l, position: undefined })),
});

describe("codecs", () => {
  it("round-trips lists and pairs", () => {
    expect(parseList("NVDA, TSLA,3, 03,  ")).toEqual(["NVDA", "TSLA", 3, "03"]);
    expect(formatList(["NVDA", 3])).toBe("NVDA, 3");
    expect(parsePairs("mood=happy, score=1, alive=true, note")).toEqual({ mood: "happy", score: 1, alive: true, note: "" });
    expect(formatPairs({ mood: "happy", score: 1 })).toBe("mood=happy, score=1");
  });
});

describe("schema", () => {
  it("never lets a block key collide with node metadata", () => {
    for (const b of BLOCKS)
      for (const item of itemsOf(b)) expect(META_KEYS as readonly string[], `${b.type}.${item.name}`).not.toContain(irKey(item.name));
  });

  it("keeps blocks that share an IR type in the same kind", () => {
    for (const [ir, specs] of IR_VARIANTS) expect(new Set(specs.map(kindOf)).size, ir).toBe(1);
  });

  it("resolves if vs if-else by the keys present", () => {
    expect(resolveSpec({ type: "if", condition: true, then: [] })?.type).toBe("control_if");
    expect(resolveSpec({ type: "if", condition: true, then: [], else: [] })?.type).toBe("control_if_else");
  });

  it("exports a JSON Schema for the AI compiler", () => {
    const schema = JSON.stringify(programJsonSchema());
    expect(schema).toContain("create_agent");
    expect(schema).toContain("volume_milestone");
  });
});

describe("validator", () => {
  const script = (body: unknown[], event: unknown = { type: "button" }) => ({ scripts: [{ event, body }] });

  it("fills defaults and assigns ids to hand-written (AI-style) IR", () => {
    const p = mustParse(script([{ type: "create_agent", speciesMode: "free_text", species: "frog" }]));
    const agent = p.scripts[0].body[0];
    expect(agent).toMatchObject({ type: "create_agent", nameMode: "ai_generated", species: "frog", memory: true, var: "agent" });
    expect(agent.id).toBeTruthy();
    expect(p.scripts[0].event.id).toBeTruthy();
  });

  it("rejects unknown node types, unknown keys and bad enum values", () => {
    for (const bad of [
      script([{ type: "spawn_rat" }]),
      script([{ type: "set_var", var: "x", value: 1, sneaky: true }]),
      script([{ type: "create_agent", nameMode: "telepathic" }]),
      script([], { type: "set_var" }), // statement used as an event
    ]) {
      const r = parseProgram(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("names unknown blocks plainly instead of listing every block", () => {
    const r = parseProgram(script([{ type: "spawn_rat" }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]).toEqual({ path: "scripts[0].body[0].type", message: '"spawn_rat" is not a CIRCUIT block' });
  });

  it("type-checks connections like Blockly does", () => {
    const r = parseProgram(script([{ type: "if", condition: 5, then: [] }]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]).toMatchObject({ path: "scripts[0].body[0].condition" });
    expect(parseProgram(script([{ type: "if", condition: { type: "compare", a: 1, op: "gt", b: 0 }, then: [] }])).ok).toBe(true);
  });

  it("rejects a statement used as a value", () => {
    expect(parseProgram(script([{ type: "set_var", var: "x", value: { type: "update_feed", message: "hi" } }])).ok).toBe(false);
  });

  it("requires STOP to be last in its stack", () => {
    const r = parseProgram(script([{ type: "stop" }, { type: "increment_var", var: "x" }]));
    expect(r.ok).toBe(false);
  });

  it("canonicalizes literal nodes and quoted numbers", () => {
    const p = mustParse(
      script([
        { type: "set_var", var: "x", value: { type: "number", num: 3 } },
        { type: "sim_buy", asset: "META", amount: "0.03", unit: "SOL" },
      ]),
    );
    expect(p.scripts[0].body[0].value).toBe(3);
    expect(p.scripts[0].body[1].amount).toBe(0.03);
  });

  it("re-assigns duplicate ids", () => {
    const p = mustParse(script([{ type: "increment_var", id: "dup" }, { type: "increment_var", id: "dup" }]));
    const [a, b] = p.scripts[0].body;
    expect(a.id).toBe("dup");
    expect(b.id).not.toBe("dup");
  });
});

describe("Blockly ⇄ IR round trip", () => {
  it("round-trips every block in the library", () => {
    for (const spec of BLOCKS) {
      const ws = new Blockly.Workspace();
      const { type, inputs, fields } = toolboxEntry(spec);
      const block = Blockly.serialization.blocks.append({ type, inputs, fields } as Blockly.serialization.blocks.State, ws);
      block.moveBy(10, 20);
      const state = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
      ws.dispose();

      const ir1 = mustParse(blocklyToProgram(state));
      const ir2 = mustParse(blocklyToProgram(throughBlockly(programToBlockly(ir1).state)));
      expect(ir2, spec.type).toEqual(ir1);
    }
  });

  it("round-trips the starter program exactly", () => {
    const state = throughBlockly(STARTER_PROGRAM as WorkspaceState);
    const ir1 = mustParse(blocklyToProgram(state));
    expect(ir1.scripts).toHaveLength(1);
    const [change, ifElse] = ir1.scripts[0].body;
    expect(change).toMatchObject({ type: "change_var", var: "clicks", by: 1 });
    expect(ifElse).toMatchObject({
      type: "if",
      condition: { type: "compare", a: { type: "var", var: "clicks" }, op: "gte", b: "3" },
      then: [{ type: "update_feed" }, { type: "set_var", value: "0" }],
      else: [{ type: "update_feed", message: "Click {clicks}" }],
    });
    const ir2 = mustParse(blocklyToProgram(throughBlockly(programToBlockly(ir1).state)));
    expect(ir2).toEqual(ir1);
  });

  it("keeps parsing idempotent (Blockly output is already canonical)", () => {
    const ir = blocklyToProgram(throughBlockly(STARTER_PROGRAM as WorkspaceState));
    expect(mustParse(structuredClone(ir))).toEqual(ir);
  });

  it("builds an AI-written program into blocks and reads back the same program", () => {
    // The spec's Living Crew program, written the way an LLM would: no ids, positions or defaults.
    const ai = {
      scripts: [
        {
          event: { type: "volume_milestone", amount: 10 },
          body: [
            { type: "create_agent", species: "cat, frog, penguin, raccoon, dog, capybara" },
            { type: "set_var", var: "selectedAsset", value: { type: "random_item", list: ["NVDA", "TSLA", "AAPL", "META", "AMD"] } },
            { type: "sim_buy", asset: { type: "var", var: "selectedAsset" }, amount: 0.03 },
            { type: "agent_set", prop: "holdings", value: { type: "var", var: "selectedAsset" } },
            { type: "add_to_world", item: { type: "var", var: "agent" } },
            {
              type: "if",
              condition: { type: "chance", percent: 50 },
              then: [{ type: "update_feed", message: "{agent} bought {selectedAsset}!" }],
              else: [],
            },
          ],
        },
      ],
    };
    const parsed = mustParse(ai);
    const { state, needsLayout } = programToBlockly(parsed);
    expect(needsLayout).toBe(true);
    const back = mustParse(blocklyToProgram(throughBlockly(state)));
    expect(withoutPositions(back)).toEqual(withoutPositions(parsed));
    // Omitted inputs were materialized with the block's defaults during validation.
    expect(parsed.scripts[0].body[3].agent).toMatchObject({ type: "var", var: "agent" });
    expect(parsed.variables).toEqual(["agent", "selectedAsset"]);
  });

  it("distinguishes an emptied input (null) from an omitted one", () => {
    const p = mustParse({ scripts: [{ event: { type: "button" }, body: [{ type: "remove_agent", agent: null }] }] });
    const back = mustParse(blocklyToProgram(throughBlockly(programToBlockly(p).state)));
    expect(back.scripts[0].body[0].agent).toBeNull();
  });

  it("preserves loose blocks, disabled and collapsed flags", () => {
    const p = mustParse({
      scripts: [{ position: { x: 0, y: 0 }, event: { type: "button", collapsed: true }, body: [{ type: "increment_var", var: "n", disabled: true }] }],
      loose: [
        { position: { x: 400, y: 0 }, body: [{ type: "notify", message: "orphan" }] },
        { position: { x: 400, y: 200 }, expr: { type: "random_number", min: 1, max: 6 } },
      ],
    });
    const back = mustParse(blocklyToProgram(throughBlockly(programToBlockly(p).state)));
    expect(back).toEqual(p);
    expect(back.scripts[0].event.collapsed).toBe(true);
    expect(back.scripts[0].body[0].disabled).toBe(true);
  });
});
