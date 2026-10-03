"use client";

import { useState } from "react";
import { AgentsPanel, FeedPanel, StatePanel, WorldPanel } from "@/components/runtime/Panels";
import { RealReceipt } from "@/components/runtime/RealReceipt";
import { SimulateBar } from "@/components/runtime/SimulateBar";
import { useRuntimeStore } from "@/store/runtime";
import { EnglishTab } from "./EnglishTab";

const TABS = ["World", "State", "Agents", "Feed", "Runs", "English"] as const;
type Tab = (typeof TABS)[number];

/** RUNS: every run's receipt, newest first. The newest are shown in full. */
function RunsTab() {
  const runs = useRuntimeStore((s) => s.state.runs);
  const [open, setOpen] = useState<number | null>(null);
  if (!runs.length)
    return (
      <p className="px-1 py-2 text-[13px] leading-normal text-[#5d6066]">
        Every run leaves a receipt here. Simulated runs are marked SIMULATED and never written to Solana.
      </p>
    );
  const list = [...runs].reverse();
  return (
    <div className="flex flex-col gap-2.5">
      {list.map((r, i) =>
        i < 3 || open === r.id ? (
          <RealReceipt key={r.id} r={r} />
        ) : (
          <RealReceipt key={r.id} r={r} size="row" onOpen={() => setOpen(r.id)} />
        ),
      )}
    </div>
  );
}

/** The right panel: where events come from, and what the program has done. */
export function PreviewPanel() {
  const [tab, setTab] = useState<Tab>("World");
  const state = useRuntimeStore((s) => s.state);
  const resetState = useRuntimeStore((s) => s.resetState);

  return (
    <aside className="flex w-[372px] shrink-0 flex-col border-l border-[#1d1f23] bg-[#0f1012] max-xl:w-[320px]">
      <SimulateBar />
      <nav className="flex border-b border-[#1d1f23] px-1.5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`-mb-px h-10 flex-1 border-b font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
              tab === t ? "border-signal text-fg" : "border-transparent text-dim hover:text-fg-2"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3.5">
        {tab === "World" && <WorldPanel state={state} />}
        {tab === "State" && <StatePanel state={state} onReset={resetState} />}
        {tab === "Agents" && <AgentsPanel state={state} />}
        {tab === "Feed" && <FeedPanel state={state} />}
        {tab === "Runs" && <RunsTab />}
        {tab === "English" && <EnglishTab />}
      </div>
    </aside>
  );
}
