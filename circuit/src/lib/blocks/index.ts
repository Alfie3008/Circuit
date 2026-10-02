import { AGENT_BLOCKS } from "./library/agents";
import { CONTROL_BLOCKS } from "./library/control";
import { DATA_BLOCKS } from "./library/data";
import { EVENT_BLOCKS } from "./library/events";
import { WEB_BLOCKS } from "./library/web";
import { WORLD_BLOCKS } from "./library/world";
import type { BlockSpec } from "./types";

/** The CIRCUIT standard library. Modules append to this list. */
export const BLOCKS: BlockSpec[] = [
  ...EVENT_BLOCKS,
  ...CONTROL_BLOCKS,
  ...DATA_BLOCKS,
  ...AGENT_BLOCKS,
  ...WEB_BLOCKS,
  ...WORLD_BLOCKS,
];

const byType = new Map(BLOCKS.map((b) => [b.type, b]));

export function getBlockSpec(type: string): BlockSpec | undefined {
  return byType.get(type);
}

export type { BlockSpec } from "./types";
