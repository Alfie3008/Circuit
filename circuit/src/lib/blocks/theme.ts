import * as Blockly from "blockly/core";
import { hueColour, TOKENS } from "@/lib/ui/colour";
import { CATEGORIES } from "./categories";

/** Fallback block font. A concrete stack (not a CSS var) — Blockly measures text with canvas. */
export const BLOCK_FONT = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** Block text: Geist Mono 12px (9pt) semibold, as in the design. */
export const BLOCK_FONT_SIZE_PT = 9;
export const BLOCK_FONT_WEIGHT = "600";

/**
 * Resolves the concrete family behind next/font's `--font-geist-mono` variable
 * and waits until it has loaded. Blockly measures text with canvas once, at
 * render time, so injecting before the font arrives leaves every block sized
 * for the fallback font.
 */
export async function loadBlockFont(): Promise<string> {
  const family =
    getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim() || BLOCK_FONT;
  try {
    await Promise.all([
      document.fonts.load(`${BLOCK_FONT_WEIGHT} 12px ${family}`),
      document.fonts.load(`400 12px ${family}`),
    ]);
    await document.fonts.ready;
  } catch {
    // Fall through with whatever is available; blocks still render.
  }
  return family;
}

/**
 * Dark theme: every block shares the same near-black fill; the category shows
 * as a coloured border and a two-letter tag (drawn by the renderer).
 * - colourPrimary: block fill
 * - colourSecondary: shadow-block (pill) fill
 * - colourTertiary: border
 */
export function createCircuitTheme(family = BLOCK_FONT): Blockly.Theme {
  const blockStyles: Record<string, Partial<Blockly.Theme.BlockStyle>> = {};
  const categoryStyles: Record<string, Blockly.Theme.CategoryStyle> = {};
  for (const c of CATEGORIES) {
    const style = {
      colourPrimary: TOKENS.block,
      colourSecondary: TOKENS.canvas,
      colourTertiary: hueColour(c.hue, 0.52, 0.08),
    };
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
      workspaceBackgroundColour: TOKENS.canvas,
      toolboxBackgroundColour: TOKENS.panel,
      toolboxForegroundColour: TOKENS.ink,
      flyoutBackgroundColour: "#141518",
      flyoutForegroundColour: TOKENS.ink,
      flyoutOpacity: 0.97,
      scrollbarColour: "#2a2c31",
      scrollbarOpacity: 0.9,
      insertionMarkerColour: TOKENS.ink,
      insertionMarkerOpacity: 0.18,
      cursorColour: TOKENS.signal,
      selectedGlowColour: TOKENS.signal,
      selectedGlowOpacity: 0.55,
      replacementGlowColour: TOKENS.signal,
      replacementGlowOpacity: 0.5,
    },
    fontStyle: { family, weight: BLOCK_FONT_WEIGHT, size: BLOCK_FONT_SIZE_PT },
    startHats: true,
  });
}
