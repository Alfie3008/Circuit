/**
 * Circuit IR — the typed program representation shared by the Blockly editor,
 * the AI compiler (Phase 5) and the interpreter (Phase 3).
 *
 * Node schemas are generated from the block registry: each BlockSpec's `ir`
 * type becomes a strict object whose keys are its fields and inputs in
 * camelCase (NAME_MODE → nameMode). So the IR can never drift from the blocks.
 *
 *   Program  { version, variables, scripts: [{ position?, event, body }], loose }
 *   Event    hat node, e.g. { type: "volume_milestone", amount: 10 }
 *   Stmt     e.g. { type: "set_var", var: "asset", value: Expr }
 *   Expr     primitive literal | list literal | reporter node
 *
 * Literal shorthand: 3, "META", true and ["a", "b"] stand for number, text,
 * boolean and list blocks — the form an LLM writes most reliably.
 */
import { z } from "zod";
import { BLOCKS } from "@/lib/blocks";
import type { BlockSpec, FieldSpec, InputSpec } from "@/lib/blocks/types";
import { parseList, parsePairs } from "./codecs";

// ---------------------------------------------------------------------------
// Types (structural; exact per-node shapes are enforced by the Zod schemas)
// ---------------------------------------------------------------------------

export interface IRNode {
  type: string;
  id?: string;
  collapsed?: boolean;
  disabled?: boolean;
  [key: string]: unknown;
}
export type ListLiteral = (string | number)[];
export type Expr = string | number | boolean | ListLiteral | IRNode;
export interface Position {
  x: number;
  y: number;
}
export interface Script {
  position?: Position;
  event: IRNode;
  body: IRNode[];
}
export type Loose = { position?: Position; body: IRNode[] } | { position?: Position; expr: Expr };
export interface Program {
  version: 1;
  variables: string[];
  scripts: Script[];
  loose: Loose[];
}

/** Keys every node may carry besides its block-specific ones. */
export const META_KEYS = ["type", "id", "collapsed", "disabled"] as const;

/** Blocks whose IR is a literal shorthand rather than a node. */
export const LITERAL_BLOCKS = {
  number: "data_number",
  text: "data_text",
  boolean: "data_boolean",
  list: "data_list",
} as const;

// ---------------------------------------------------------------------------
// Registry views
// ---------------------------------------------------------------------------

export type NodeKind = "event" | "stmt" | "expr";

export const kindOf = (spec: BlockSpec): NodeKind =>
  spec.shape === "hat" ? "event" : spec.shape === "reporter" || spec.shape === "boolean" ? "expr" : "stmt";

export const irKey = (name: string) => name.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

type Item = Exclude<FieldSpec, { kind: "label" }> | InputSpec;
/** Named fields and inputs of a block, in order. */
export const itemsOf = (spec: BlockSpec): Item[] =>
  spec.rows.flatMap((r) => r.items).filter((i): i is Item => i.kind !== "label");

/** IR type → block specs. Several blocks may share one IR type (if / if-else). */
export const IR_VARIANTS = new Map<string, BlockSpec[]>();
for (const b of BLOCKS) IR_VARIANTS.set(b.ir, [...(IR_VARIANTS.get(b.ir) ?? []), b]);

const keysOf = (spec: BlockSpec) => new Set(itemsOf(spec).map((i) => irKey(i.name)));

/**
 * The block a node compiles to. Among blocks sharing its IR type, picks the
 * smallest one that has every key the node uses ({ type: "if", else: [] } → if-else).
 */
export function resolveSpec(node: IRNode): BlockSpec | undefined {
  const variants = IR_VARIANTS.get(node.type);
  if (!variants) return undefined;
  const used = Object.keys(node).filter((k) => !(META_KEYS as readonly string[]).includes(k) && node[k] !== undefined);
  const fits = variants.filter((v) => used.every((k) => keysOf(v).has(k)));
  return (fits.length ? fits : variants).sort((a, b) => keysOf(a).size - keysOf(b).size)[0];
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const PositionSchema = z.strictObject({ x: z.number(), y: z.number() });
const ListLiteralSchema = z.array(z.union([z.string(), z.number()]));

// Recursive: node schemas (declared below) contain Expr/Stmt, so these are lazy.
export const ExprSchema: z.ZodType<Expr> = z.lazy(() =>
  z.union([z.number(), z.string(), z.boolean(), ListLiteralSchema, ExprNodeSchema]),
);
export const StmtSchema: z.ZodType<IRNode> = z.lazy(() => StmtNodeSchema);

function itemSchema(item: Item, withDefault: boolean): z.ZodType {
  // Defaults are produced fresh each parse so list/object defaults are never shared.
  const d = <T extends z.ZodType>(s: T, value: unknown) =>
    withDefault ? s.default((() => structuredClone(value)) as never) : s.optional();
  switch (item.kind) {
    case "text":
      if (item.format === "list") return d(ListLiteralSchema, parseList(item.value));
      if (item.format === "pairs")
        return d(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])), parsePairs(item.value));
      return d(z.string(), item.value);
    case "number": {
      let s = z.number();
      if (item.min !== undefined) s = s.min(item.min);
      if (item.max !== undefined) s = s.max(item.max);
      return d(s, item.value);
    }
    case "dropdown": {
      const values = item.options.map((o) => o[1]) as [string, ...string[]];
      return d(z.enum(values), values[0]);
    }
    case "checkbox":
      return d(z.boolean(), item.value);
    case "variable":
      return d(z.string().min(1), item.variable);
    case "value":
      // null = deliberately empty; omitted = use the block's default
      return ExprSchema.nullable().optional();
    case "statement":
      return withDefault ? z.array(StmtSchema).default([]) : z.array(StmtSchema).optional();
  }
}

function nodeSchema(ir: string, specs: BlockSpec[]) {
  const shape: Record<string, z.ZodType> = {
    type: z.literal(ir),
    id: z.string().min(1).optional(),
    collapsed: z.boolean().optional(),
    disabled: z.boolean().optional(),
  };
  const seen = new Map<string, { item: Item; count: number }>();
  for (const spec of specs)
    for (const item of itemsOf(spec)) {
      const key = irKey(item.name);
      seen.set(key, { item, count: (seen.get(key)?.count ?? 0) + 1 });
    }
  // Keys shared by every variant get defaults; variant-only keys stay optional.
  for (const [key, { item, count }] of seen) shape[key] = itemSchema(item, count === specs.length);
  return z.strictObject(shape).describe(specs[0].tooltip);
}

function unionOf(kind: NodeKind) {
  const members = [...IR_VARIANTS]
    .filter(([, specs]) => kindOf(specs[0]) === kind)
    .map(([ir, specs]) => nodeSchema(ir, specs));
  return z.discriminatedUnion("type", members as [ReturnType<typeof nodeSchema>, ...ReturnType<typeof nodeSchema>[]]);
}

const ExprNodeSchema = unionOf("expr") as unknown as z.ZodType<IRNode>;
const StmtNodeSchema = unionOf("stmt") as unknown as z.ZodType<IRNode>;
export const EventNodeSchema = unionOf("event") as unknown as z.ZodType<IRNode>;

export const ScriptSchema = z.strictObject({
  position: PositionSchema.optional(),
  event: EventNodeSchema,
  body: z.array(StmtSchema).default([]),
});

/** Blocks left on the canvas without an event hat. Kept for editing; never executed. */
export const LooseSchema = z.union([
  z.strictObject({ position: PositionSchema.optional(), body: z.array(StmtSchema) }),
  z.strictObject({ position: PositionSchema.optional(), expr: ExprSchema }),
]);

export const ProgramSchema = z.strictObject({
  version: z.literal(1).default(1),
  variables: z.array(z.string().min(1)).default([]),
  scripts: z.array(ScriptSchema).default([]),
  loose: z.array(LooseSchema).default([]),
});
