import type { BlockSpec, FieldSpec, InputSpec } from "./types";

/** Extension that hides mode-dependent text boxes (registered in extensions.ts). */
export const HIDE_FIELDS_EXTENSION = "circuit_hide_fields";

/** Blockly JSON for one field or input. */
function arg(item: FieldSpec | InputSpec): Record<string, unknown> {
  switch (item.kind) {
    case "label":
      return { type: "field_label", text: item.text };
    case "text":
      return { type: "field_input", name: item.name, text: item.value };
    case "number":
      return { type: "field_number", name: item.name, value: item.value, min: item.min, max: item.max, precision: item.precision };
    case "dropdown":
      return { type: "field_dropdown", name: item.name, options: item.options };
    case "checkbox":
      return { type: "field_checkbox", name: item.name, checked: item.value };
    case "variable":
      return { type: "field_variable", name: item.name, variable: item.variable };
    case "value":
      return { type: "input_value", name: item.name, check: item.check };
    case "statement":
      return { type: "input_statement", name: item.name };
  }
}

/**
 * Converts a BlockSpec to a Blockly JSON block definition.
 *
 * All blocks render inline; rows are separated with `input_end_row`, so a row
 * can mix labels, fields and value inputs in reading order ("for [0.03] SOL").
 */
export function toBlocklyJson(spec: BlockSpec): Record<string, unknown> {
  const def: Record<string, unknown> = {
    type: spec.type,
    style: `${spec.category}_${spec.shape === "hat" ? "hat" : "blocks"}`,
    tooltip: spec.tooltip,
    inputsInline: true,
  };

  spec.rows.forEach((r, i) => {
    const args = r.items.map(arg);
    const last = r.items[r.items.length - 1];
    const isLastRow = i === spec.rows.length - 1;
    if (last?.kind !== "statement") {
      if (!isLastRow) args.push({ type: "input_end_row" });
      else if (last?.kind !== "value") args.push({ type: "input_dummy" });
    }
    def[`message${i}`] = args.map((_, j) => `%${j + 1}`).join(" ");
    def[`args${i}`] = args;
  });

  if (spec.rows.some((r) => r.items.some((i) => i.kind === "text" && i.hideWhen))) {
    def.extensions = [HIDE_FIELDS_EXTENSION];
  }

  switch (spec.shape) {
    case "hat":
      def.nextStatement = null;
      break;
    case "statement":
      def.previousStatement = null;
      def.nextStatement = null;
      break;
    case "terminal":
      def.previousStatement = null;
      break;
    case "reporter":
      def.output = spec.output ?? null;
      break;
    case "boolean":
      def.output = "Boolean";
      break;
  }
  return def;
}
