"use client";

import Link from "next/link";
import { LogoMark } from "@/components/site/Logo";
import { useProjectStore } from "@/store/project";
import { useRuntimeStore } from "@/store/runtime";
import { AiButton } from "./AiBar";
import { ProjectMenu } from "./ProjectMenu";
import { RunButton } from "./RunButton";

const btn =
  "h-8 cursor-pointer whitespace-nowrap rounded-[7px] border border-line-2 bg-transparent px-3 font-mono text-[12px] tracking-[0.04em] text-[#c9c7c2] transition-colors hover:bg-white/[0.03] hover:text-fg";
const divider = <span className="mx-1 h-5 w-px shrink-0 bg-[#26282d]" />;

/** Whether AI blocks call a real model or answer with mock text. (The design's fuel meter takes this place once AI fuel exists.) */
function AiStatus() {
  const ai = useRuntimeStore((s) => s.aiStatus);
  const live = !!ai?.enabled;
  return (
    <span
      title={live ? `AI blocks use ${ai!.runtimeModel}; Build with AI uses ${ai!.compileModel}.` : "No Anthropic key on the server: AI blocks answer with mock text."}
      className="hidden h-8 items-center gap-2 whitespace-nowrap rounded-[7px] border border-line-2 px-2.5 font-mono text-[11.5px] text-[#c9c7c2] min-[1100px]:flex"
    >
      <span className="text-[10px] tracking-[0.1em] text-muted">AI</span>
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-ok" : "bg-[#55585e]"}`} />
      <span className={live ? "text-ok" : "text-dim"}>{live ? "LIVE" : "MOCK"}</span>
    </span>
  );
}

function SaveButton() {
  const status = useProjectStore((s) => s.saveStatus);
  const flush = useProjectStore((s) => s.flush);
  return (
    <button
      className={`${btn} ${status === "error" ? "border-err/60 text-err" : ""}`}
      onClick={flush}
      title={status === "error" ? "Browser storage is full or blocked. Export your project to keep it." : "Projects autosave. Save writes immediately."}
    >
      {status === "error" ? "Not saved" : status === "saving" ? "Saving…" : "Save"}
    </button>
  );
}

export function BuilderHeader() {
  const blocks = useProjectStore((s) => s.stats.blocks);
  const openDialog = useProjectStore((s) => s.openDialog);
  const debug = useRuntimeStore((s) => s.debug);
  const setDebug = useRuntimeStore((s) => s.setDebug);

  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center gap-3.5 border-b border-[#1d1f23] bg-[#0f1012] px-3.5">
      <Link href="/" className="flex shrink-0 items-center" aria-label="CIRCUIT home">
        <LogoMark />
      </Link>
      <span className="h-5 w-px shrink-0 bg-[#26282d]" />
      <div className="flex min-w-0 shrink items-center gap-2">
        <ProjectMenu />
        <span className="hidden shrink-0 rounded-[4px] border border-line-2 px-1.5 py-px font-mono text-[10.5px] tabular-nums text-muted min-[1240px]:inline">
          {blocks} {blocks === 1 ? "BLOCK" : "BLOCKS"}
        </span>
      </div>
      <div className="flex min-w-[120px] flex-1 justify-center overflow-hidden">
        <AiButton />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <AiStatus />
        {divider}
        <button className={btn} onClick={() => openDialog("backtest")} title="If this program had been running…">
          Backtest
        </button>
        <button
          className={`${btn} hidden min-[1240px]:block ${debug ? "border-signal/55 bg-signal/10 text-[oklch(0.88_0.13_80)] hover:bg-signal/15" : ""}`}
          onClick={() => setDebug(!debug)}
          aria-pressed={debug}
          title="Debug mode: runs pause at every block so you can step through them"
        >
          Debug
        </button>
        <SaveButton />
        <RunButton />
        <button
          onClick={() => openDialog("golive")}
          title="Give this project a public page, and run it on the server"
          className="flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap rounded-[7px] border border-ok/55 bg-ok/10 px-3.5 font-mono text-[12px] font-semibold tracking-[0.04em] text-[oklch(0.88_0.11_155)] transition-colors hover:bg-ok/20"
        >
          <span className="h-1.5 w-1.5 rounded-[3px] bg-ok" />
          Go live
        </button>
      </div>
    </header>
  );
}
