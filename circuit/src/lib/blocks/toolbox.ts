import type * as Blockly from "blockly/core";
import { BLOCKS } from ".";
import { CATEGORIES } from "./categories";
import type { BlockSpec } from "./types";

type Json = Record<string, unknown>;

/** A toolbox block entry; minus `kind`, it is also valid Blockly block state. */
export interface ToolboxBlock {
  kind: "block";
  type: string;
  inputs?: Json;
  fields?: Json;
}

/** Key of the dynamic Variables category (its flyout lists the workspace's variables). */
export const VARIABLES_CATEGORY = "CIRCUIT_VARIABLES";
export const CREATE_VARIABLE_BUTTON = "CIRCUIT_CREATE_VARIABLE";

/** Flyout heading, e.g. "EVENTS · 5 BLOCKS". */
export function flyoutHeader(name: string, count: number) {
  return { kind: "label", text: `${name.toUpperCase()} · ${count} ${count === 1 ? "BLOCK" : "BLOCKS"}`, "web-class": "circuitFlyoutHeader" } as const;
}

/** Toolbox entry for a block, with default shadows/blocks filled into its inputs. */
export function toolboxEntry(spec: BlockSpec, fieldOverrides: Json = {}): ToolboxBlock {
  const inputs: Json = {};
  for (const r of spec.rows) {
    for (const item of r.items) {
      if (item.kind === "value" && item.default) {
        const { type, fields, shadow } = item.default;
        inputs[item.name] = { [shadow ? "shadow" : "block"]: { type, fields } };
      }
    }
  }
  const entry: ToolboxBlock = { kind: "block", type: spec.type };
  if (Object.keys(inputs).length) entry.inputs = inputs;
  if (Object.keys(fieldOverrides).length) entry.fields = fieldOverrides;
  return entry;
}

export function buildToolbox(): Blockly.utils.toolbox.ToolboxDefinition {
  return {
    kind: "categoryToolbox",
    contents: CATEGORIES.map((cat) => {
      const base = { kind: "category", name: cat.name, categorystyle: `${cat.id}_category` };
      if (cat.id === "variables") return { ...base, custom: VARIABLES_CATEGORY };
      const blocks = BLOCKS.filter((b) => b.category === cat.id);
      return { ...base, contents: [flyoutHeader(cat.name, blocks.length), ...blocks.map((b) => toolboxEntry(b))] };
    }),
  } as Blockly.utils.toolbox.ToolboxDefinition;
}

/**
 * Flyout contents for the Variables category: a "New variable" button, a
 * getter per existing variable, then the variable statements bound to the first one.
 */
export function variablesFlyout(variables: { id: string; name: string }[]): Blockly.utils.toolbox.FlyoutItemInfoArray {
  const varBlocks = BLOCKS.filter((b) => b.category === "variables");
  const getter = varBlocks.find((b) => b.type === "variables_get")!;
  const first = variables[0];
  return [
    flyoutHeader("Variables", variables.length + varBlocks.length - 1),
    { kind: "label", text: "Variables keep their values between runs" },
    { kind: "button", text: "+ New variable", callbackkey: CREATE_VARIABLE_BUTTON, "web-class": "circuitNewVariable" },
    { kind: "sep", gap: 16 },
    ...variables.map((v) => toolboxEntry(getter, { VAR: { id: v.id } })),
    { kind: "sep", gap: 24 },
    ...varBlocks
      .filter((b) => b !== getter)
      .map((b) => toolboxEntry(b, first ? { VAR: { id: first.id } } : {})),
  ] as Blockly.utils.toolbox.FlyoutItemInfoArray;
}
