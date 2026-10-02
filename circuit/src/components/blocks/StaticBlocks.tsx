"use client";

import dynamic from "next/dynamic";
import type { Program } from "@/lib/ir";

export interface StaticBlocksProps {
  program: Program;
  /** Same scale as the studio by default (0.9). */
  zoom?: number;
  /** How separate stacks are arranged. */
  layout?: "column" | "row";
  gap?: number;
  padding?: number;
  /** Show only the first N blocks (in assembly order), for "AI builds it" reveals. */
  visible?: number;
  /** Block ids to hide. */
  hidden?: string[];
  /** Block lit as running. */
  active?: string | null;
  /** Blocks that have run. */
  done?: string[];
  /** Block marked as "drop here next". */
  target?: string | null;
  /** Called once drawn, with the number of blocks (what `visible` counts). */
  onReady?: (blocks: number) => void;
}

// Blockly only runs in the browser, and only pages that show blocks pay for it.
const Canvas = dynamic(() => import("./StaticBlocksCanvas"), {
  ssr: false,
  loading: () => <div style={{ height: 120 }} />,
});

/** The studio's real blocks as a picture: identical rendering, nothing draggable. */
export function StaticBlocks(props: StaticBlocksProps) {
  return <Canvas {...props} />;
}
