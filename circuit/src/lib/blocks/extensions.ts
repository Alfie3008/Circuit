import * as Blockly from "blockly/core";
import { getBlockSpec } from ".";
import { HIDE_FIELDS_EXTENSION } from "./blocklyJson";
import type { BlockSpec, HideWhen } from "./types";

export { HIDE_FIELDS_EXTENSION };

/** Text fields on this block that hide depending on a dropdown. */
export function hidingFields(spec: BlockSpec): { name: string; hideWhen: HideWhen }[] {
  return spec.rows
    .flatMap((r) => r.items)
    .flatMap((i) => (i.kind === "text" && i.hideWhen ? [{ name: i.name, hideWhen: i.hideWhen }] : []));
}

/**
 * Registers CIRCUIT's Blockly extensions. Safe to call repeatedly; works headless.
 *
 * circuit_hide_fields: hides a text box while its controlling dropdown is set to a
 * mode that needs no text (e.g. name = "AI generated"). The hidden value is kept
 * and still serialized, so switching back restores what the user typed.
 */
export function registerExtensions() {
  if (Blockly.Extensions.isRegistered(HIDE_FIELDS_EXTENSION)) return;
  Blockly.Extensions.register(HIDE_FIELDS_EXTENSION, function (this: Blockly.Block) {
    const spec = getBlockSpec(this.type);
    if (!spec) return;
    const byController = new Map<string, { name: string; hideWhen: HideWhen }[]>();
    for (const f of hidingFields(spec)) {
      byController.set(f.hideWhen.field, [...(byController.get(f.hideWhen.field) ?? []), f]);
    }
    for (const [controller, fields] of byController) {
      const dropdown = this.getField(controller);
      if (!dropdown) continue;
      const apply = (mode: string) => {
        for (const f of fields) this.getField(f.name)?.setVisible(!f.hideWhen.values.includes(mode));
        if (this instanceof Blockly.BlockSvg && this.rendered) void this.queueRender();
      };
      dropdown.setValidator((mode: string) => {
        apply(mode);
        return undefined; // accept the value unchanged
      });
      apply(dropdown.getValue() as string);
    }
  });
}
