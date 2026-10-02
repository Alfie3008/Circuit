"use client";

import { CheckIcon, CodeIcon, RedoIcon, UndoIcon } from "@/components/ui/icons";
import { useProjectStore } from "@/store/project";

const iconBtn =
  "rounded-md p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-fg disabled:pointer-events-none disabled:opacity-30";

export function UndoRedo() {
  const canUndo = useProjectStore((s) => s.canUndo);
  const canRedo = useProjectStore((s) => s.canRedo);
  const undo = useProjectStore((s) => s.undo);
  return (
    <div className="flex items-center">
      <button className={iconBtn} disabled={!canUndo} onClick={() => undo(false)} aria-label="Undo" title="Undo (Ctrl+Z)">
        <UndoIcon />
      </button>
      <button className={iconBtn} disabled={!canRedo} onClick={() => undo(true)} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
        <RedoIcon />
      </button>
    </div>
  );
}

export function SaveIndicator() {
  const status = useProjectStore((s) => s.saveStatus);
  if (status === "error")
    return (
      <span className="text-xs text-red-300" title="Browser storage is full or blocked. Export your project to keep it.">
        Not saved
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-muted" aria-live="polite">
      {status === "saving" ? "Saving…" : (
        <>
          <CheckIcon width={12} height={12} /> Saved
        </>
      )}
    </span>
  );
}

export function IrToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const valid = useProjectStore((s) => s.program !== null);
  return (
    <button
      onClick={onToggle}
      aria-pressed={open}
      title="Show the program as Circuit IR"
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
        open ? "border-accent bg-accent/15 text-fg" : "border-line text-muted hover:text-fg"
      }`}
    >
      <CodeIcon width={14} height={14} />
      IR
      <span className={`h-1.5 w-1.5 rounded-full ${valid ? "bg-emerald-400" : "bg-red-400"}`} aria-label={valid ? "valid" : "invalid"} />
    </button>
  );
}
