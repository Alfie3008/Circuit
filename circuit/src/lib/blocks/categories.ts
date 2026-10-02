import type { CategoryId } from "./types";

export interface CategoryMeta {
  id: CategoryId;
  name: string;
  colour: string;
}

/** Toolbox order and colours. */
export const CATEGORIES: CategoryMeta[] = [
  { id: "events", name: "Events", colour: "#F2B21B" },
  { id: "control", name: "Control", colour: "#F2803A" },
  { id: "logic", name: "Conditions", colour: "#5DBB4C" },
  { id: "data", name: "Math & Data", colour: "#5B7FE0" },
  { id: "variables", name: "Variables", colour: "#E5595E" },
  { id: "agents", name: "Agents", colour: "#8B5CF6" },
  { id: "ai", name: "AI", colour: "#C04FE0" },
  { id: "web", name: "Web", colour: "#2D9CDB" },
  { id: "media", name: "Media", colour: "#E5569C" },
  { id: "world", name: "Project World", colour: "#1FB5B0" },
  { id: "finance", name: "Finance", colour: "#2E9E6A" },
  { id: "bounties", name: "Bounties", colour: "#B5793A" },
  { id: "output", name: "Output", colour: "#6B7A90" },
];

export const categoryMeta = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!;
