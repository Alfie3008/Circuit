"use client";

import { motion } from "framer-motion";
import { useState } from "react";

const TABS = ["World", "Feed", "State", "Agents", "Treasury", "Executions"] as const;
type Tab = (typeof TABS)[number];

const EMPTY: Record<Tab, string> = {
  World: "Cards and entities your program creates will appear here.",
  Feed: "Activity your program posts to the project feed.",
  State: "Live variables. They persist between executions and reloads.",
  Agents: "Every persistent agent, with identity, memory and inventory.",
  Treasury: "Simulated SOL, USDC and named budgets.",
  Executions: "Receipts for every run. Each side effect is listed.",
};

/** Project World preview. Tabs fill in with the runtime in Phase 3 and 4. */
export function PreviewPanel() {
  const [tab, setTab] = useState<Tab>("World");

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-line bg-panel">
      <nav className="flex justify-between border-b border-line px-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`relative px-1.5 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide transition-colors ${
              tab === t ? "text-fg" : "text-muted hover:text-fg"
            }`}
          >
            {t}
            {tab === t && (
              <motion.span layoutId="preview-tab" className="absolute inset-x-1 -bottom-px h-0.5 rounded bg-accent" />
            )}
          </button>
        ))}
      </nav>
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <div>
          <p className="text-sm text-muted">{EMPTY[tab]}</p>
          <p className="mt-3 text-[11px] uppercase tracking-wider text-muted/60">Runtime arrives in Phase 3</p>
        </div>
      </div>
    </aside>
  );
}
