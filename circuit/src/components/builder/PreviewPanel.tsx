"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { AgentsPanel, FeedPanel, RunsPanel, StatePanel, WorldPanel } from "@/components/runtime/Panels";
import { useRuntimeStore } from "@/store/runtime";

const TABS = ["World", "State", "Agents", "Feed", "Runs"] as const;
type Tab = (typeof TABS)[number];

/** Project World preview: what the program's executions have left behind. */
export function PreviewPanel() {
  const [tab, setTab] = useState<Tab>("World");
  const state = useRuntimeStore((s) => s.state);

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-line bg-panel">
      <nav className="flex border-b border-line px-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`relative flex-1 py-3 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
              tab === t ? "text-fg" : "text-dim hover:text-fg-2"
            }`}
          >
            {t}
            {tab === t && <motion.span layoutId="preview-tab" className="absolute inset-x-2 -bottom-px h-px bg-signal" />}
          </button>
        ))}
      </nav>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
        {tab === "World" && <WorldPanel state={state} />}
        {tab === "State" && <StatePanel state={state} />}
        {tab === "Agents" && <AgentsPanel state={state} />}
        {tab === "Feed" && <FeedPanel state={state} />}
        {tab === "Runs" && <RunsPanel state={state} />}
      </div>
    </aside>
  );
}
