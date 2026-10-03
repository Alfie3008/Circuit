/**
 * The VALIDATOR stage: USER/LLM → IR → **validate** → Blockly.
 *
 * 1. Zod: shape, enums, ranges, unknown keys, unknown node types.
 * 2. Semantics: connection types match what Blockly would accept, STOP is last
 *    in its list, ids are unique.
 * 3. Canonical form: literal nodes become shorthand, omitted inputs get the
 *    block's default, every referenced variable is declared. The interpreter
 *    and converters can then rely on a fully explicit program.
 */
import { z } from "zod";
import type { Check, ValueType } from "@/lib/blocks/types";
import { exprFromBlockState } from "./fromBlockly";
import {
  irKey,
  itemsOf,
  kindOf,
  ProgramSchema,
  resolveSpec,
  type Expr,
  type IRNode,
  type Program,
} from "./schema";

export interface IrIssue {
  path: string;
  message: string;
}

export type ParseResult = { ok: true; program: Program } | { ok: false; issues: IrIssue[] };

const fmtPath = (path: readonly PropertyKey[]) =>
  path.reduce<string>((acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${String(p)}` : String(p)), "");

const valueAt = (root: unknown, path: readonly PropertyKey[]) =>
  path.reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Record<PropertyKey, unknown>)[k] : undefined), root);

/** Connection type an expression produces (null = any). */
export function outputOf(e: Expr): Check {
  if (typeof e === "number") return ["Number"];
  if (typeof e === "string") return ["String"];
  if (typeof e === "boolean") return ["Boolean"];
  if (Array.isArray(e)) return ["List"];
  const spec = resolveSpec(e);
  if (!spec) return null;
  return spec.shape === "boolean" ? ["Boolean"] : (spec.output ?? null);
}

/** Same rule as Blockly's connection checker: compatible if either side is untyped or they share a type. */
export const compatible = (input: Check, output: Check) =>
  input === null || output === null || output.some((t: ValueType) => input.includes(t));

const isNumericString = (v: unknown): v is string => typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v));

let counter = 0;
export const newId = () => `c${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Deepest nesting and most nodes a program may have (far past anything built by hand). */
export const MAX_DEPTH = 150;
export const MAX_NODES = 20_000;

/** Checks size and nesting without recursion, so hostile input can't overflow the stack. */
function tooBig(input: unknown): IrIssue | null {
  const stack: [unknown, number][] = [[input, 0]];
  let nodes = 0;
  while (stack.length) {
    const [v, depth] = stack.pop()!;
    if (!v || typeof v !== "object") continue;
    if (depth > MAX_DEPTH) return { path: "", message: `blocks are nested more than ${MAX_DEPTH} deep` };
    if (++nodes > MAX_NODES) return { path: "", message: `the program is too big (over ${MAX_NODES.toLocaleString("en-US")} parts)` };
    for (const child of Array.isArray(v) ? v : Object.values(v)) if (child && typeof child === "object") stack.push([child, depth + 1]);
  }
  return null;
}

/** Parse + validate untrusted input (a file, an LLM response). Never throws. */
export function parseProgram(input: unknown, opts: { makeId?: () => string } = {}): ParseResult {
  const big = tooBig(input);
  if (big) return { ok: false, issues: [big] };
  try {
    return parseUnchecked(input, opts);
  } catch (e) {
    return { ok: false, issues: [{ path: "", message: `the program couldn't be read (${e instanceof Error ? e.message : String(e)})` }] };
  }
}

function parseUnchecked(input: unknown, opts: { makeId?: () => string }): ParseResult {
  const parsed = ProgramSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => {
        // An unknown `type` fails the discriminated union with a list of every block; say it plainly.
        const value = valueAt(input, i.path);
        const message =
          i.code === "invalid_union" && i.path.at(-1) === "type" && typeof value === "string"
            ? `"${value}" is not a CIRCUIT block`
            : i.message;
        return { path: fmtPath(i.path), message };
      }),
    };
  }
  const program = parsed.data as Program;
  const issues: IrIssue[] = [];
  const ids = new Set<string>();
  const variables = new Set(program.variables);
  const makeId = opts.makeId ?? newId;

  const claimId = (node: IRNode) => {
    if (!node.id || ids.has(node.id)) node.id = makeId();
    ids.add(node.id);
  };

  /** Canonical literal form: { type: "number", num: 3 } → 3, etc. */
  const canonical = (e: Expr): Expr => {
    if (typeof e !== "object" || Array.isArray(e)) return e;
    switch (e.type) {
      case "number":
        return e.num as number;
      case "text":
        return e.text as string;
      case "boolean":
        return e.bool === "true";
      case "list":
        return e.items as (string | number)[];
      default:
        return e;
    }
  };

  const visitNode = (node: IRNode, path: string) => {
    claimId(node);
    const spec = resolveSpec(node)!;
    for (const item of itemsOf(spec)) {
      const key = irKey(item.name);
      const at = `${path}.${key}`;
      if (item.kind === "variable") {
        variables.add(node[key] as string);
      } else if (item.kind === "statement") {
        const list = node[key] as IRNode[] | undefined;
        if (list) visitList(list, at);
      } else if (item.kind === "value") {
        let v = node[key] as Expr | null | undefined;
        if (v === undefined && item.default) {
          const { type, fields } = item.default;
          v = exprFromBlockState({ type, fields });
        }
        if (v === undefined || v === null) {
          node[key] = null;
          continue;
        }
        v = canonical(v);
        // LLMs often quote numbers: "0.03" into a Number-only slot means 0.03.
        if (item.check?.length === 1 && item.check[0] === "Number" && isNumericString(v)) v = Number(v);
        node[key] = v;
        const out = outputOf(v);
        if (!compatible(item.check, out)) {
          issues.push({ path: at, message: `expects ${item.check!.join(" or ")}, got ${out!.join(" or ")}` });
        }
        if (typeof v === "object" && !Array.isArray(v)) {
          const s = resolveSpec(v);
          if (s && kindOf(s) !== "expr") issues.push({ path: at, message: `"${v.type}" is a statement, not a value` });
          else visitNode(v, at);
        }
      }
    }
  };

  const visitList = (list: IRNode[], path: string) => {
    list.forEach((node, i) => {
      const spec = resolveSpec(node)!;
      if (spec.shape === "terminal" && i !== list.length - 1) {
        issues.push({ path: `${path}[${i}]`, message: `"${node.type}" must be the last block in its stack` });
      }
      visitNode(node, `${path}[${i}]`);
    });
  };

  program.scripts.forEach((s, i) => {
    visitNode(s.event, `scripts[${i}].event`);
    visitList(s.body, `scripts[${i}].body`);
  });
  program.loose.forEach((l, i) => {
    if ("body" in l) visitList(l.body, `loose[${i}].body`);
    else {
      l.expr = canonical(l.expr);
      if (typeof l.expr === "object" && !Array.isArray(l.expr)) visitNode(l.expr, `loose[${i}].expr`);
    }
  });

  program.variables = [...variables];
  return issues.length ? { ok: false, issues } : { ok: true, program };
}

/** Technical summary of issues, for the AI repair prompt and logs. */
export const formatIssues = (issues: IrIssue[]) =>
  issues.map((i) => `• ${i.path || "(root)"}: ${i.message}`).join("\n");

const TYPE_WORDS: Record<string, string> = { Number: "a number", String: "text", Boolean: "true/false", List: "a list", Object: "an object", Agent: "an agent" };
const typeWords = (list: string) =>
  list
    .split(" or ")
    .map((t) => TYPE_WORDS[t] ?? t.toLowerCase())
    .join(" or ");

/** An issue's message in everyday words. */
function plainMessage(message: string): string {
  let m: RegExpExecArray | null;
  if ((m = /^expects (.+), got (.+)$/.exec(message))) return `needs ${typeWords(m[1])} here, but got ${typeWords(m[2])}`;
  if ((m = /^"(.+)" is not a CIRCUIT block$/.exec(message))) return `uses a block Circuit doesn't have ("${m[1]}")`;
  if ((m = /^"(.+)" is a statement, not a value$/.exec(message))) return "has an action block where a value should go";
  if (/must be the last block in its stack/.test(message)) return "must be the last block in its stack: nothing can come after it";
  if ((m = /expected (\w+), received (\w+)/i.exec(message))) return `has ${m[2] === "undefined" ? "something missing" : `${m[2]} where ${m[1]} should be`}`;
  if (/too_big|too big|Too big/.test(message)) return "has a number or text that's too big";
  if (/too_small|too small|Too small/.test(message)) return "has a number that's too small";
  return message;
}

export interface DescribedIssue {
  /** e.g. "Script 2 · the SET block: needs a number here, but got text" */
  text: string;
  /** The block to highlight, when the issue is inside one that has an id. */
  blockId?: string;
}

/** Issues in words a person can act on, naming the script and the block. */
export function describeIssues(input: unknown, issues: IrIssue[]): DescribedIssue[] {
  return issues.slice(0, 8).map((issue) => {
    const steps = issue.path.split(/\.|\[(\d+)\]/).filter((x) => x !== undefined && x !== "");
    let at: unknown = input;
    let block: IRNode | null = null;
    let where = "The program";
    for (let i = 0; i < steps.length; i++) {
      const k = /^\d+$/.test(steps[i]) ? Number(steps[i]) : steps[i];
      if (steps[i - 1] === "scripts" && typeof k === "number") where = `Script ${k + 1}`;
      if (steps[i - 1] === "loose" && typeof k === "number") where = "A loose block";
      at = at && typeof at === "object" ? (at as Record<PropertyKey, unknown>)[k] : undefined;
      if (at && typeof at === "object" && !Array.isArray(at) && typeof (at as IRNode).type === "string") block = at as IRNode;
    }
    let name = "";
    try {
      const spec = block ? resolveSpec(block) : undefined;
      const label = spec?.rows[0]?.items.find((x) => x.kind === "label");
      name = label && label.kind === "label" ? label.text.toUpperCase() : spec ? String(block!.type).replace(/_/g, " ").toUpperCase() : "";
    } catch {
      // keep the name empty
    }
    const text = `${where}${name ? ` · the ${name} block` : ""}: ${plainMessage(issue.message)}`;
    return { text, ...(block && typeof block.id === "string" ? { blockId: block.id } : {}) };
  });
}

/** Issues as a short message for a notice. */
export const plainIssues = (input: unknown, issues: IrIssue[]) =>
  describeIssues(input, issues)
    .map((d) => `• ${d.text}`)
    .join("\n") + (issues.length > 8 ? `\n…and ${issues.length - 8} more` : "");

/** JSON Schema of the IR (used to constrain the AI compiler in Phase 5). */
export const programJsonSchema = () => z.toJSONSchema(ProgramSchema, { io: "input", unrepresentable: "any" });
