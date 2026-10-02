"use client";

import Link from "next/link";
import { CodeIcon } from "@/components/ui/icons";
import { useProjectStore } from "@/store/project";
import { AiBar } from "./AiBar";
import { SaveIndicator, UndoRedo } from "./EditorControls";
import { ProjectMenu } from "./ProjectMenu";

/** Three-node circuit mark from the design: two outlined nodes and a lit amber one. */
function LogoMark() {
  return (
    <span className="relative inline-flex h-3 items-center gap-[5px]" aria-hidden>
      <span className="absolute inset-x-0.5 top-1/2 h-px bg-[#4a4d53]" />
      <span className="relative h-[7px] w-[7px] rounded-[1px] border border-[#c9c7c2] bg-ink" />
      <span className="relative h-[7px] w-[7px] rounded-[1px] border border-[#c9c7c2] bg-ink" />
      <span className="relative h-[7px] w-[7px] rounded-[1px] bg-signal shadow-[0_0_8px_var(--color-signal)]" />
    </span>
  );
}

const ghostBtn =
  "inline-flex h-[30px] items-center gap-2 whitespace-nowrap rounded-md border border-line-2 bg-panel px-3 font-mono text-xs tracking-[0.04em] text-fg-2 transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40";

export function BuilderHeader({ irOpen, onToggleIr }: { irOpen: boolean; onToggleIr: () => void }) {
  const blocks = useProjectStore((s) => s.stats.blocks);
  const valid = useProjectStore((s) => s.program !== null);
  const flush = useProjectStore((s) => s.flush);
  const notify = useProjectStore((s) => s.notify);
  const soon = () => notify("info", "Running and debugging arrive with the runtime in Phase 3.");

  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center gap-4 border-b border-[#1d1f23] bg-ink px-4">
      <div className="flex min-w-[150px] flex-1 basis-0 items-center gap-3">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="CIRCUIT home">
          <LogoMark />
          <span className="hidden font-mono text-[13px] font-semibold tracking-[0.18em] xl:inline">CIRCUIT</span>
        </Link>
        <span className="h-4 w-px shrink-0 bg-line-2" />
        <ProjectMenu />
        <span className="hidden shrink-0 rounded-full border border-line-2 bg-panel px-2 py-0.5 font-mono text-[10.5px] tracking-[0.08em] text-muted tabular-nums xl:inline">
          {blocks} {blocks === 1 ? "BLOCK" : "BLOCKS"}
        </span>
      </div>

      <div className="w-[520px] min-w-[220px] shrink">
        <AiBar />
      </div>

      <div className="flex flex-1 basis-0 items-center justify-end gap-2">
        <UndoRedo />
        <SaveIndicator />
        <button
          onClick={onToggleIr}
          aria-pressed={irOpen}
          title="Show the program as Circuit IR"
          className={`${ghostBtn} px-2 ${irOpen ? "border-signal/55 text-fg" : ""}`}
        >
          <CodeIcon width={13} height={13} />
          <span className={`h-1.5 w-1.5 rounded-full ${valid ? "bg-ok" : "bg-err"}`} aria-label={valid ? "IR valid" : "IR invalid"} />
        </button>
        <button className={ghostBtn} onClick={soon} title="Step through a run (Phase 3)">
          Debug
        </button>
        <button className={ghostBtn} onClick={flush} title="Projects autosave. Save writes immediately.">
          Save
        </button>
        <button
          onClick={soon}
          title="Run the program (Phase 3)"
          className="inline-flex h-[30px] items-center gap-2 whitespace-nowrap rounded-md bg-signal px-3.5 font-mono text-xs font-medium tracking-[0.04em] text-signal-ink transition-[filter] hover:brightness-110"
        >
          <span className="h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-signal-ink" aria-hidden />
          Run
        </button>
      </div>
    </header>
  );
}
