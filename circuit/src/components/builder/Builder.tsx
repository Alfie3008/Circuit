"use client";

import { AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useProjectStore } from "@/store/project";
import { IrToggle, SaveIndicator, UndoRedo } from "./EditorControls";
import { IrPanel } from "./IrPanel";
import { NoticeToast } from "./NoticeToast";
import { PreviewPanel } from "./PreviewPanel";
import { ProjectMenu } from "./ProjectMenu";
import { PromptBar } from "./PromptBar";

const BlocklyWorkspace = dynamic(() => import("./BlocklyWorkspace"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-muted">Loading blocks…</div>,
});

export function Builder() {
  const stats = useProjectStore((s) => s.stats);
  const [irOpen, setIrOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col bg-ink text-fg">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-lg font-bold tracking-[0.2em]">CIRCUIT</span>
          <span className="hidden text-sm text-muted xl:inline">Make your coin do something.</span>
        </div>
        <div className="mx-1 h-5 w-px bg-line" />
        <ProjectMenu />
        <UndoRedo />
        <SaveIndicator />
        <div className="ml-auto flex items-center gap-3 text-xs text-muted">
          <span className="hidden tabular-nums md:inline">
            {stats.scripts} {stats.scripts === 1 ? "script" : "scripts"} · {stats.blocks} blocks
          </span>
          <IrToggle open={irOpen} onToggle={() => setIrOpen((o) => !o)} />
          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-semibold uppercase tracking-wider text-amber-300">
            Simulated finance
          </span>
        </div>
      </header>
      <PromptBar />
      <main className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <BlocklyWorkspace />
          <AnimatePresence>{irOpen && <IrPanel onClose={() => setIrOpen(false)} />}</AnimatePresence>
        </div>
        <PreviewPanel />
      </main>
      <NoticeToast />
    </div>
  );
}
