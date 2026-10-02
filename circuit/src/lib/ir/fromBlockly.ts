/**
 * Blockly workspace JSON (Blockly.serialization.workspaces.save) → Circuit IR.
 * Pure JSON transform — no Blockly runtime needed.
 */
import { getBlockSpec } from "@/lib/blocks";
import { parseList, parsePairs } from "./codecs";
import { irKey, itemsOf, LITERAL_BLOCKS, type Expr, type IRNode, type Loose, type Program, type Script } from "./schema";

/** Subset of Blockly's serialized block state that we read. */
export interface BlockState {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  collapsed?: boolean;
  enabled?: boolean;
  disabledReasons?: string[];
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockState; shadow?: BlockState }>;
  next?: { block?: BlockState };
}

export interface WorkspaceState {
  blocks?: { languageVersion?: number; blocks?: BlockState[] };
  variables?: { name: string; id: string; type?: string }[];
}

export class IrConversionError extends Error {}

/** Readers for serialized blocks; `varNames` maps variable ids to names. */
function makeReader(varNames: Map<string, string>) {
  const fieldValue = (raw: unknown, item: ReturnType<typeof itemsOf>[number]): unknown => {
    switch (item.kind) {
      case "text": {
        const text = typeof raw === "string" ? raw : item.value;
        if (item.format === "list") return parseList(text);
        if (item.format === "pairs") return parsePairs(text);
        return text;
      }
      case "number":
        return raw === undefined ? item.value : Number(raw);
      case "checkbox":
        return raw === undefined ? item.value : raw === true || raw === "TRUE";
      case "dropdown":
        return raw ?? item.options[0][1];
      case "variable": {
        const ref = raw as { id?: string; name?: string } | undefined;
        return (ref?.id && varNames.get(ref.id)) || ref?.name || item.variable;
      }
      default:
        return raw;
    }
  };

  const node = (b: BlockState): IRNode => {
    const spec = getBlockSpec(b.type);
    if (!spec) throw new IrConversionError(`Unknown block type "${b.type}"`);
    const out: IRNode = { type: spec.ir };
    if (b.id) out.id = b.id;
    if (b.collapsed) out.collapsed = true;
    if (b.enabled === false || b.disabledReasons?.length) out.disabled = true;
    for (const item of itemsOf(spec)) {
      const key = irKey(item.name);
      if (item.kind === "statement") out[key] = stmtList(b.inputs?.[item.name]?.block);
      else if (item.kind === "value") {
        const slot = b.inputs?.[item.name];
        const target = slot?.block ?? slot?.shadow;
        out[key] = target ? expr(target) : null;
      } else out[key] = fieldValue(b.fields?.[item.name], item);
    }
    return out;
  };

  /** Literal blocks become shorthand; everything else a node. */
  const expr = (b: BlockState): Expr => {
    const f = b.fields ?? {};
    switch (b.type) {
      case LITERAL_BLOCKS.number:
        return Number(f.NUM ?? 0);
      case LITERAL_BLOCKS.text:
        return String(f.TEXT ?? "");
      case LITERAL_BLOCKS.boolean:
        return f.BOOL === "true";
      case LITERAL_BLOCKS.list:
        return parseList(String(f.ITEMS ?? ""));
      default:
        return node(b);
    }
  };

  const stmtList = (head?: BlockState): IRNode[] => {
    const out: IRNode[] = [];
    for (let b = head; b; b = b.next?.block) out.push(node(b));
    return out;
  };

  return { node, expr, stmtList };
}

/** IR for a single serialized value block (used to materialize input defaults). */
export const exprFromBlockState = (b: BlockState): Expr => makeReader(new Map()).expr(b);

export function blocklyToProgram(state: WorkspaceState): Program {
  const { node, expr, stmtList } = makeReader(new Map((state.variables ?? []).map((v) => [v.id, v.name])));
  const scripts: Script[] = [];
  const loose: Loose[] = [];
  for (const top of state.blocks?.blocks ?? []) {
    const spec = getBlockSpec(top.type);
    if (!spec) throw new IrConversionError(`Unknown block type "${top.type}"`);
    const position = { x: top.x ?? 0, y: top.y ?? 0 };
    if (spec.shape === "hat") scripts.push({ position, event: node(top), body: stmtList(top.next?.block) });
    else if (spec.shape === "reporter" || spec.shape === "boolean") loose.push({ position, expr: expr(top) });
    else loose.push({ position, body: stmtList(top) });
  }

  return { version: 1, variables: (state.variables ?? []).map((v) => v.name), scripts, loose };
}
