import * as Blockly from "blockly/core";
import * as En from "blockly/msg/en";
import { BLOCKS } from ".";
import { toBlocklyJson } from "./blocklyJson";
import { registerExtensions } from "./extensions";
import { CREATE_VARIABLE_BUTTON, VARIABLES_CATEGORY, variablesFlyout } from "./toolbox";

let registered = false;

/** Defines every CIRCUIT block with Blockly. Idempotent; client-only. */
export function registerCircuitBlocks() {
  if (registered) return;
  registered = true;
  Blockly.setLocale(En as unknown as Record<string, string>);
  registerExtensions();
  Blockly.common.defineBlocksWithJsonArray(BLOCKS.map(toBlocklyJson));
  // Circuit IR doesn't carry comments or per-block inline/external layout, so
  // offering them would create edits that silently vanish on save.
  for (const id of ["blockComment", "blockInline"]) {
    if (Blockly.ContextMenuRegistry.registry.getItem(id)) Blockly.ContextMenuRegistry.registry.unregister(id);
  }
}

/** Hooks a freshly injected workspace up to the dynamic Variables category. */
export function attachWorkspaceCallbacks(ws: Blockly.WorkspaceSvg) {
  ws.registerToolboxCategoryCallback(VARIABLES_CATEGORY, (w) =>
    variablesFlyout(
      w
        .getVariableMap()
        .getAllVariables()
        .map((v) => ({ id: v.getId(), name: v.getName() }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ),
  );
  ws.registerButtonCallback(CREATE_VARIABLE_BUTTON, (button) =>
    Blockly.Variables.createVariableButtonHandler(button.getTargetWorkspace()),
  );
}
