"use client";

import { motion } from "framer-motion";
import { useState } from "react";

const TABS = ["World", "State", "Agents", "Feed", "Runs"] as const;
type Tab = (typeof TABS)[number];

const EMPTY: Record<Tab, string> = {
  World: "Empty. Entities your program creates will appear here.",
  State: "Live variables and the simulated treasury. They persist between runs and reloads.",
  Agents: "Every persistent agent, with identity, memory and inventory.",
  Feed: "Activity your program posts to the project feed.",
  Runs: "A receipt for every execution, with each side effect listed.",
};

/** Project World preview. Tabs fill in with the runtime in Phase 3 and 4. */
export function PreviewPanel() {
  const [tab, setTab] = useState<Tab>("World");

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-line bg-panel">
      <nav className="flex border-b border-line px-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`relative flex-1 py-3 font-mono text-[11px] tracking-[0.12em] uppercase transition-colors ${
              tab === t ? "text-fg" : "text-dim hover:text-fg-2"
            }`}
          >
            {t}
            {tab === t && <motion.span layoutId="preview-tab" className="absolute inset-x-2 -bottom-px h-px bg-signal" />}
          </button>
        ))}
      </nav>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex justify-between font-mono text-[11px] tracking-[0.12em] text-muted">
          <span>{tab.toUpperCase()}</span>
          <span className="text-faint">PHASE 3</span>
        </div>
        <div className="mt-3.5 flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-[#2a2c31] p-6 text-center text-[13px] leading-relaxed text-[#5d6066]">
          {EMPTY[tab]}
        </div>
      </div>
    </aside>
  );
}
