import { create } from "zustand";

/** Studio chrome that several components toggle: the AI panel and the IR panel. */
export const useBuilderUi = create<{ aiOpen: boolean; irOpen: boolean; setAi: (open: boolean) => void; setIr: (open: boolean) => void }>((set) => ({
  aiOpen: false,
  irOpen: false,
  setAi: (aiOpen) => set({ aiOpen }),
  setIr: (irOpen) => set({ irOpen }),
}));
