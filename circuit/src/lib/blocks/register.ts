import * as Blockly from "blockly/core";
import * as En from "blockly/msg/en";
import { BLOCKS } from ".";
import { toBlocklyJson } from "./blocklyJson";
import { CREATE_VARIABLE_BUTTON, VARIABLES_CATEGORY, variablesFlyout } from "./toolbox";

let registered = false;

/** Defines every CIRCUIT block with Blockly. Idempotent; client-only. */
export function registerCircuitBlocks() {
  if (registered) return;
  registered = true;
  Blockly.setLocale(En as unknown as Record<string, string>);
  Blockly.common.defineBlocksWithJsonArray(BLOCKS.map(toBlocklyJson));
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
