"use client";

import { AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { useState } from "react";
import { ConsolePane } from "./ConsolePane";
import { Dialogs } from "./Dialogs";
import { BuilderHeader } from "./BuilderHeader";
import { ExplainPanel } from "./ExplainPanel";
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
  // One side panel over the canvas at a time.
  const [panel, setPanel] = useState<"ir" | "explain" | null>(null);
  const toggle = (p: "ir" | "explain") => setPanel((cur) => (cur === p ? null : p));

  return (
    <div className="flex h-dvh flex-col bg-ink text-fg">
      <BuilderHeader panel={panel} onToggle={toggle} />
      <main className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 bg-canvas">
            <BlocklyWorkspace />
            <AnimatePresence>
              {panel === "ir" && <IrPanel key="ir" onClose={() => setPanel(null)} />}
              {panel === "explain" && <ExplainPanel key="explain" onClose={() => setPanel(null)} />}
            </AnimatePresence>
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
