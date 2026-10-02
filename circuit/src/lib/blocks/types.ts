/**
 * CIRCUIT block library — data model.
 *
 * Every block is declared once as a BlockSpec. From that single declaration we
 * derive the Blockly JSON definition, the toolbox entry and (Phase 2) the IR
 * mapping. Modules extend the language by contributing more BlockSpecs — the
 * workspace, toolbox and interpreter never special-case a block type.
 */

export type CategoryId =
  | "events"
  | "control"
  | "logic"
  | "data"
  | "variables"
  | "agents"
  | "ai"
  | "web"
  | "media"
  | "world"
  | "finance"
  | "bounties"
  | "output";

/** The module that owns a block's runtime adapter (see /modules, Phase 4). */
export type ModuleId =
  | "core"
  | "solana"
  | "ai"
  | "browser"
  | "website"
  | "finance"
  | "bounties"
  | "social";

/** Connection types. `null` check = accepts anything. */
export type ValueType = "Number" | "String" | "Boolean" | "List" | "Object" | "Agent";
export type Check = ValueType[] | null;

export type Shape =
  | "hat" // event — starts a script
  | "statement" // stackable action
  | "terminal" // stackable, nothing can follow (STOP)
  | "reporter" // returns a value
  | "boolean"; // returns true/false, fits IF

export type FieldSpec =
  | { kind: "label"; text: string }
  | { kind: "text"; name: string; value: string }
  | { kind: "number"; name: string; value: number; min?: number; max?: number; precision?: number }
  | { kind: "dropdown"; name: string; options: [label: string, value: string][] }
  | { kind: "checkbox"; name: string; value: boolean }
  | { kind: "variable"; name: string; variable: string };

/** Default block placed into a value input in the toolbox. */
export interface InputDefault {
  type: string;
  fields: Record<string, unknown>;
  /** Shadow blocks are replaceable placeholders; variable getters can't be shadows. */
  shadow: boolean;
}

export type InputSpec =
  | { kind: "value"; name: string; check: Check; default?: InputDefault }
  | { kind: "statement"; name: string };

/**
 * One visual row: fields and value inputs in reading order. A statement input
 * (a C-shaped slot) must end its row.
 */
export interface Row {
  items: (FieldSpec | InputSpec)[];
}

export interface BlockSpec {
  /** Blockly block type, `<category>_<name>`. */
  type: string;
  category: CategoryId;
  module: ModuleId;
  /** IR node type this block compiles to (Phase 2). */
  ir: string;
  shape: Shape;
  /** Output type for reporters. */
  output?: Check;
  rows: Row[];
  tooltip: string;
  /** For hats: names readable via the "event [field]" reporter. */
  eventOutputs?: string[];
  /** Side effect is simulated in the public prototype. */
  simulated?: boolean;
}

// ---------------------------------------------------------------------------
// Authoring helpers — keep the library files terse and readable.
// ---------------------------------------------------------------------------

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export const label = (text: string): FieldSpec => ({ kind: "label", text });
export const text = (name: string, value = ""): FieldSpec => ({ kind: "text", name, value });
export const num = (
  name: string,
  value = 0,
  opts: { min?: number; max?: number; precision?: number } = {},
): FieldSpec => ({ kind: "number", name, value, ...opts });
/** Options given as plain strings get a slugged value: "AI generated" → "ai_generated". */
export const dropdown = (name: string, options: (string | [string, string])[]): FieldSpec => ({
  kind: "dropdown",
  name,
  options: options.map((o) => (typeof o === "string" ? [o, slug(o)] : o)),
});
export const checkbox = (name: string, value = false): FieldSpec => ({ kind: "checkbox", name, value });
export const variable = (name: string, v: string): FieldSpec => ({ kind: "variable", name, variable: v });

const TEXTY: ValueType[] = ["String", "Number"];

export const valueIn = (name: string, check: Check, def?: InputDefault): InputSpec => ({
  kind: "value",
  name,
  check,
  default: def,
});
export const numIn = (name: string, value = 0) =>
  valueIn(name, ["Number"], { type: "data_number", fields: { NUM: value }, shadow: true });
export const textIn = (name: string, value = "") =>
  valueIn(name, TEXTY, { type: "data_text", fields: { TEXT: value }, shadow: true });
/** Accepts any value; defaults to a text shadow. */
export const anyIn = (name: string, value = "") =>
  valueIn(name, null, { type: "data_text", fields: { TEXT: value }, shadow: true });
export const boolIn = (name: string) => valueIn(name, ["Boolean"]);
export const listIn = (name: string, items?: string) =>
  valueIn(
    name,
    ["List"],
    items === undefined ? undefined : { type: "data_list", fields: { ITEMS: items }, shadow: true },
  );
export const objIn = (name: string) => valueIn(name, ["Object"]);
/** Agent input, pre-filled with a `get agent` variable block. */
export const agentIn = (name = "AGENT", v = "agent") =>
  valueIn(name, ["Agent"], { type: "variables_get", fields: { VAR: { name: v } }, shadow: false });
/** Any-typed input pre-filled with a variable getter. */
export const varIn = (name: string, v: string) =>
  valueIn(name, null, { type: "variables_get", fields: { VAR: { name: v } }, shadow: false });
export const stmt = (name: string): InputSpec => ({ kind: "statement", name });

/** One visual row. Strings become labels. */
export function row(...parts: (string | FieldSpec | InputSpec)[]): Row {
  const items = parts.map((p) => (typeof p === "string" ? label(p) : p));
  items.forEach((it, i) => {
    if (it.kind === "statement" && i !== items.length - 1)
      throw new Error(`Statement input ${it.name} must end its row`);
  });
  return { items };
}

type Def = Omit<BlockSpec, "category" | "module"> & { module?: ModuleId };

/** Declare the blocks of one category, sharing a default module. */
export function category(cat: CategoryId, module: ModuleId, defs: Def[]): BlockSpec[] {
  return defs.map((d) => ({ module, ...d, category: cat }));
}
