import type { WorkspaceSvg } from "blockly/core";
import { create } from "zustand";

interface WorkspaceStats {
  blocks: number;
  scripts: number;
}

interface WorkspaceState {
  workspace: WorkspaceSvg | null;
  stats: WorkspaceStats;
  setWorkspace: (ws: WorkspaceSvg | null) => void;
  setStats: (stats: WorkspaceStats) => void;
}

/** Holds the live Blockly workspace so panels outside the canvas can reach it. */
export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspace: null,
  stats: { blocks: 0, scripts: 0 },
  setWorkspace: (workspace) => set({ workspace }),
  setStats: (stats) => set({ stats }),
}));
