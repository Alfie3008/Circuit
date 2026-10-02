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

/** Parse + validate untrusted input (a file, an LLM response). Never throws. */
export function parseProgram(input: unknown, opts: { makeId?: () => string } = {}): ParseResult {
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

/** Human-readable summary of issues, for toasts and the AI repair prompt. */
export const formatIssues = (issues: IrIssue[]) =>
  issues.map((i) => `• ${i.path || "(root)"}: ${i.message}`).join("\n");

/** JSON Schema of the IR (used to constrain the AI compiler in Phase 5). */
export const programJsonSchema = () => z.toJSONSchema(ProgramSchema, { io: "input", unrepresentable: "any" });
