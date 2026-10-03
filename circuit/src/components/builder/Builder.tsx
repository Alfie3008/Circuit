"use client";

import { AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useBuilderUi } from "@/store/builderUi";
import { AiPanel } from "./AiBar";
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
  const irOpen = useBuilderUi((s) => s.irOpen);
  const setIr = useBuilderUi((s) => s.setIr);

  return (
    <div className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-ink text-fg">
      <ErrorBoundary name="header">
        <BuilderHeader />
      </ErrorBoundary>
      <main className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 bg-canvas">
            <ErrorBoundary name="block canvas">
              <BlocklyWorkspace />
            </ErrorBoundary>
            <ErrorBoundary name="AI panel">
              <AiPanel />
            </ErrorBoundary>
            <ErrorBoundary name="program view">
              <AnimatePresence>{irOpen && <IrPanel key="ir" onClose={() => setIr(false)} />}</AnimatePresence>
            </ErrorBoundary>
          </div>
          <ErrorBoundary name="console">
            <ConsolePane />
          </ErrorBoundary>
        </div>
        <ErrorBoundary name="preview panel" className="w-[360px] shrink-0 border-l border-line">
          <PreviewPanel />
        </ErrorBoundary>
      </main>
      <NoticeToast />
      <ErrorBoundary name="dialog" className="fixed bottom-4 left-4 z-[400] rounded-lg border border-err/50 bg-panel">
        <Dialogs />
      </ErrorBoundary>
    </div>
  );
}
