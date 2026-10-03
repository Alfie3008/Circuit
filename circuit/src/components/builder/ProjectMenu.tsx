"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, TrashIcon } from "@/components/ui/icons";
import { FILE_EXTENSION } from "@/lib/project/file";
import { useBuilderUi } from "@/store/builderUi";
import { useProjectStore } from "@/store/project";

const timeAgo = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
};

/** Project name (click to rename) and the project menu: new, open, duplicate, import/export, reset. */
export function ProjectMenu() {
  const current = useProjectStore((s) => s.current);
  const projects = useProjectStore((s) => s.projects);
  const actions = useProjectStore.getState();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const item = "flex w-full items-center rounded-md px-3 py-1.5 text-left font-sans text-[13px] text-fg hover:bg-white/5";

  return (
    <div ref={root} className="relative flex min-w-0 items-center font-mono text-[12px]">
      <span className="shrink-0 text-dim">you</span>
      <span className="shrink-0 px-1.5 text-faint">/</span>
      <input
        aria-label="Project name"
        value={draft ?? current?.name ?? ""}
        onFocus={() => setDraft(current?.name ?? "")}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) actions.renameProject(draft);
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(null);
            requestAnimationFrame(() => (document.activeElement as HTMLElement)?.blur());
          }
        }}
        className="min-w-[2ch] max-w-56 truncate rounded border-b border-transparent bg-transparent text-[oklch(0.88_0.13_80)] [field-sizing:content] hover:border-line-2 focus:border-signal/60 focus:outline-none"
      />
      <span className="shrink-0 text-faint">.circuit</span>
      <button
        aria-label="Project menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="ml-0.5 shrink-0 rounded-md p-1 text-dim hover:bg-white/5 hover:text-fg"
      >
        <ChevronDownIcon width={14} height={14} />
      </button>

      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-line-2 bg-panel p-1 shadow-2xl shadow-black/50">
          <button role="menuitem" className={item} onClick={run(() => actions.openDialog("templates"))}>New project…</button>
          <button role="menuitem" className={item} onClick={run(actions.duplicateProject)}>Duplicate</button>
          <button role="menuitem" className={item} onClick={run(() => actions.openDialog("setup"))}>Project setup…</button>
          <button role="menuitem" className={item} onClick={run(() => useBuilderUi.getState().setIr(!useBuilderUi.getState().irOpen))}>Show Circuit IR (program JSON)</button>
          <a role="menuitem" className={item} href="/modules">Modules</a>
          <div className="my-1 border-t border-line" />
          <p className="px-3 pb-1 pt-1.5 text-[10.5px] tracking-[0.12em] text-dim">OPEN</p>
          <div className="max-h-56 overflow-y-auto">
            {projects.map((p) => (
              <div key={p.id} className="group flex items-center rounded-md hover:bg-white/5">
                <button
                  role="menuitem"
                  onClick={run(() => actions.openProject(p.id))}
                  className="flex min-w-0 flex-1 items-baseline gap-2 px-3 py-1.5 text-left font-sans text-[13px]"
                >
                  <span className={`truncate ${p.id === current?.id ? "text-signal" : "text-fg"}`}>{p.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(p.updatedAt)}</span>
                </button>
                <button
                  aria-label={`Delete ${p.name}`}
                  onClick={() => {
                    if (confirm(`Delete "${p.name}"? This can't be undone.`)) actions.deleteProject(p.id);
                  }}
                  className="mr-1 rounded p-1 text-muted opacity-0 hover:text-err focus:opacity-100 group-hover:opacity-100"
                >
                  <TrashIcon width={14} height={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="my-1 border-t border-line" />
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              file.current?.click();
            }}
          >
            Import {FILE_EXTENSION}…
          </button>
          <button role="menuitem" className={item} onClick={run(actions.exportProject)}>
            Export {FILE_EXTENSION}
          </button>
          <div className="my-1 border-t border-line" />
          <button
            role="menuitem"
            className={`${item} text-err`}
            onClick={run(() => {
              if (confirm("Clear every block in this project? You can undo this.")) actions.resetProject();
            })}
          >
            Reset project…
          </button>
        </div>
      )}

      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void actions.importProject(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
