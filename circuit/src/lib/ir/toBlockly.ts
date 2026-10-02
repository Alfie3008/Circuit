/**
 * Circuit IR → Blockly workspace JSON (for Blockly.serialization.workspaces.load).
 * Expects a program that passed parseProgram().
 */
import type { InputDefault, InputSpec } from "@/lib/blocks/types";
import { formatList, formatPairs, type Scalar } from "./codecs";
import type { BlockState, WorkspaceState } from "./fromBlockly";
import { irKey, itemsOf, LITERAL_BLOCKS, resolveSpec, type Expr, type IRNode, type Program } from "./schema";

const isLiteral = (e: Expr) => typeof e !== "object" || Array.isArray(e);

export interface ToBlocklyResult {
  state: WorkspaceState;
  /** Some scripts had no position (e.g. AI output) — the caller should tidy the canvas. */
  needsLayout: boolean;
}

export function programToBlockly(program: Program): ToBlocklyResult {
  const variables = new Map<string, string>(); // name → id
  const varId = (name: string) => {
    if (!variables.has(name)) variables.set(name, `var_${name}`);
    return variables.get(name)!;
  };
  program.variables.forEach(varId);

  /** Default fields as stored in the registry ({ VAR: { name } }) → serialized form. */
  const defaultState = (def: InputDefault): BlockState => ({
    type: def.type,
    fields: Object.fromEntries(
      Object.entries(def.fields).map(([k, v]) => {
        const name = (v as { name?: string } | null)?.name;
        return [k, typeof name === "string" ? { id: varId(name) } : v];
      }),
    ),
  });

  const exprState = (e: Expr): BlockState => {
    if (typeof e === "number") return { type: LITERAL_BLOCKS.number, fields: { NUM: e } };
    if (typeof e === "string") return { type: LITERAL_BLOCKS.text, fields: { TEXT: e } };
    if (typeof e === "boolean") return { type: LITERAL_BLOCKS.boolean, fields: { BOOL: String(e) } };
    if (Array.isArray(e)) return { type: LITERAL_BLOCKS.list, fields: { ITEMS: formatList(e) } };
    return nodeState(e);
  };

  const inputState = (item: Extract<InputSpec, { kind: "value" }>, v: Expr | null | undefined) => {
    const def = item.default;
    if (v === null) return undefined; // deliberately empty
    if (v === undefined) return def ? { [def.shadow ? "shadow" : "block"]: defaultState(def) } : undefined;
    const st = exprState(v);
    // A literal matching the slot's shadow type *is* the shadow (an editable placeholder).
    if (def?.shadow && isLiteral(v) && st.type === def.type) return { shadow: st };
    return def?.shadow ? { shadow: defaultState(def), block: st } : { block: st };
  };

  const chain = (list: IRNode[]): BlockState | undefined => {
    let next: BlockState | undefined;
    for (let i = list.length - 1; i >= 0; i--) {
      const st = nodeState(list[i]);
      if (next) st.next = { block: next };
      next = st;
    }
    return next;
  };

  function nodeState(node: IRNode): BlockState {
    const spec = resolveSpec(node);
    if (!spec) throw new Error(`Unknown IR type "${node.type}"`);
    const st: BlockState = { type: spec.type };
    if (node.id) st.id = node.id;
    if (node.collapsed) st.collapsed = true;
    if (node.disabled) st.disabledReasons = ["MANUALLY_DISABLED"];
    const fields: Record<string, unknown> = {};
    const inputs: NonNullable<BlockState["inputs"]> = {};
    for (const item of itemsOf(spec)) {
      const key = irKey(item.name);
      const v = node[key];
      switch (item.kind) {
        case "statement": {
          const head = chain((v as IRNode[] | undefined) ?? []);
          if (head) inputs[item.name] = { block: head };
          break;
        }
        case "value": {
          const slot = inputState(item, v as Expr | null | undefined);
          if (slot) inputs[item.name] = slot;
          break;
        }
        case "variable":
          fields[item.name] = { id: varId((v as string | undefined) ?? item.variable) };
          break;
        case "text":
          if (item.format === "list") fields[item.name] = formatList((v as (string | number)[] | undefined) ?? []);
          else if (item.format === "pairs") fields[item.name] = formatPairs((v as Record<string, Scalar> | undefined) ?? {});
          else fields[item.name] = v ?? item.value;
          break;
        case "number":
        case "checkbox":
          fields[item.name] = v ?? item.value;
          break;
        case "dropdown":
          fields[item.name] = v ?? item.options[0][1];
          break;
      }
    }
    if (Object.keys(fields).length) st.fields = fields;
    if (Object.keys(inputs).length) st.inputs = inputs;
    return st;
  }

  let needsLayout = false;
  const place = (st: BlockState, pos: { x: number; y: number } | undefined, index: number) => {
    if (pos) Object.assign(st, { x: pos.x, y: pos.y });
    else {
      needsLayout = true;
      Object.assign(st, { x: 40, y: 40 + index * 320 });
    }
    return st;
  };

  const blocks: BlockState[] = [];
  program.scripts.forEach((s) => {
    const hat = nodeState(s.event);
    const body = chain(s.body);
    if (body) hat.next = { block: body };
    blocks.push(place(hat, s.position, blocks.length));
  });
  program.loose.forEach((l) => {
    const st = "body" in l ? chain(l.body) : exprState(l.expr);
    if (st) blocks.push(place(st, l.position, blocks.length));
  });

  return {
    state: {
      blocks: { languageVersion: 0, blocks },
      variables: [...variables].map(([name, id]) => ({ name, id })),
    },
    needsLayout,
  };
}
