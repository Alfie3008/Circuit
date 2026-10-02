"use client";

import dynamic from "next/dynamic";
import { useWorkspaceStore } from "@/store/workspace";
import { PreviewPanel } from "./PreviewPanel";
import { PromptBar } from "./PromptBar";

const BlocklyWorkspace = dynamic(() => import("./BlocklyWorkspace"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-muted">Loading blocks…</div>,
});

export function Builder() {
  const stats = useWorkspaceStore((s) => s.stats);

  return (
    <div className="flex h-dvh flex-col bg-ink text-fg">
      <header className="flex items-center gap-4 border-b border-line px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-lg font-bold tracking-[0.2em]">CIRCUIT</span>
          <span className="hidden text-sm text-muted sm:inline">Make your coin do something.</span>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted">
          <span className="tabular-nums">
            {stats.scripts} {stats.scripts === 1 ? "script" : "scripts"} · {stats.blocks} blocks
          </span>
          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-semibold uppercase tracking-wider text-amber-300">
            Simulated finance
          </span>
        </div>
      </header>
      <PromptBar />
      <main className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <BlocklyWorkspace />
        </div>
        <PreviewPanel />
      </main>
    </div>
  );
}
