import * as Blockly from "blockly/core";
import { CATEGORIES } from "./categories";

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const c = (n >> shift) & 0xff;
    const v = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.round(v).toString(16).padStart(2, "0");
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** Block font. A concrete stack (not a CSS var) — Blockly measures text with canvas. */
export const BLOCK_FONT = '"Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif';

export function createCircuitTheme(): Blockly.Theme {
  const blockStyles: Record<string, Partial<Blockly.Theme.BlockStyle>> = {};
  const categoryStyles: Record<string, Blockly.Theme.CategoryStyle> = {};
  for (const c of CATEGORIES) {
    const style = { colourPrimary: c.colour, colourSecondary: shade(c.colour, 0.25), colourTertiary: shade(c.colour, -0.25) };
    blockStyles[`${c.id}_blocks`] = style;
    blockStyles[`${c.id}_hat`] = { ...style, hat: "cap" };
    categoryStyles[`${c.id}_category`] = { colour: c.colour };
  }
  return Blockly.Theme.defineTheme("circuit-dark", {
    name: "circuit-dark",
    base: Blockly.Themes.Classic,
    blockStyles,
    categoryStyles,
    componentStyles: {
      workspaceBackgroundColour: "#0d1017",
      toolboxBackgroundColour: "#131722",
      toolboxForegroundColour: "#c9d1e0",
      flyoutBackgroundColour: "#181d2b",
      flyoutForegroundColour: "#c9d1e0",
      flyoutOpacity: 0.97,
      scrollbarColour: "#3a4358",
      scrollbarOpacity: 0.6,
      insertionMarkerColour: "#ffffff",
      insertionMarkerOpacity: 0.3,
      cursorColour: "#d0d0d0",
    },
    fontStyle: { family: BLOCK_FONT, weight: "600", size: 11 },
    startHats: true,
  });
}
