import { hueColour } from "@/lib/ui/colour";
import type { CategoryId } from "./types";

export interface CategoryMeta {
  id: CategoryId;
  name: string;
  /** Two-letter tag shown on the category rail and on every block. */
  code: string;
  /** OKLCH hue of the category accent; null = neutral. */
  hue: number | null;
  /** Accent colour (hex), derived from `hue`. */
  colour: string;
}

const cat = (id: CategoryId, name: string, code: string, hue: number | null): CategoryMeta => ({
  id,
  name,
  code,
  hue,
  colour: hueColour(hue),
});

/** Toolbox order, tags and accent hues. */
export const CATEGORIES: CategoryMeta[] = [
  cat("events", "Events", "EV", 80),
  cat("control", "Control", "CT", null),
  cat("logic", "Conditions", "LG", 200),
  cat("data", "Math & Data", "DT", 235),
  cat("variables", "Variables", "ST", 170),
  cat("agents", "Agents", "AG", 300),
  cat("ai", "AI", "AI", 330),
  cat("web", "Web", "WB", 215),
  cat("media", "Media", "MD", 265),
  cat("world", "Project World", "WD", 140),
  cat("finance", "Finance", "FN", 100),
  cat("bounties", "Bounties", "BT", 45),
  cat("output", "Output", "IO", 20),
];

export const categoryMeta = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!;
