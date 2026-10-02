"use client";

import { AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { useState } from "react";
import { ConsolePane } from "./ConsolePane";
import { Dialogs } from "./Dialogs";
import { BuilderHeader } from "./BuilderHeader";
import { IrPanel } from "./IrPanel";
import { NoticeToast } from "./NoticeToast";
import { PreviewPanel } from "./PreviewPanel";

const BlocklyWorkspace = dynamic(() => import("./BlocklyWorkspace"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center font-mono text-xs tracking-[0.12em] text-dim">LOADING BLOCKS…</div>
  ),
});

export function Builder() {
  const [irOpen, setIrOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col bg-ink text-fg">
      <BuilderHeader irOpen={irOpen} onToggleIr={() => setIrOpen((o) => !o)} />
      <main className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 bg-canvas">
            <BlocklyWorkspace />
            <AnimatePresence>{irOpen && <IrPanel onClose={() => setIrOpen(false)} />}</AnimatePresence>
          </div>
          <ConsolePane />
        </div>
        <PreviewPanel />
      </main>
      <NoticeToast />
      <Dialogs />
    </div>
  );
}
