"use client";

import { CheckIcon, RedoIcon, UndoIcon } from "@/components/ui/icons";
import { useProjectStore } from "@/store/project";

const iconBtn =
  "rounded-md p-1.5 text-dim transition-colors hover:bg-white/5 hover:text-fg disabled:pointer-events-none disabled:opacity-30";

export function UndoRedo() {
  const canUndo = useProjectStore((s) => s.canUndo);
  const canRedo = useProjectStore((s) => s.canRedo);
  const undo = useProjectStore((s) => s.undo);
  return (
    <div className="flex items-center">
      <button className={iconBtn} disabled={!canUndo} onClick={() => undo(false)} aria-label="Undo" title="Undo (Ctrl+Z)">
        <UndoIcon width={14} height={14} />
      </button>
      <button className={iconBtn} disabled={!canRedo} onClick={() => undo(true)} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
        <RedoIcon width={14} height={14} />
      </button>
    </div>
  );
}

export function SaveIndicator() {
  const status = useProjectStore((s) => s.saveStatus);
  if (status === "error")
    return (
      <span className="font-mono text-[11px] tracking-[0.06em] text-err" title="Browser storage is full or blocked. Export your project to keep it.">
        NOT SAVED
      </span>
    );
  return (
    <span className="hidden items-center gap-1 font-mono text-[11px] tracking-[0.06em] text-dim xl:flex" aria-live="polite">
      {status === "saving" ? "SAVING…" : (
        <>
          <CheckIcon width={11} height={11} /> SAVED
        </>
      )}
    </span>
  );
}
