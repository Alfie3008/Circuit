"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/ui/icons";
import { selectedRootId, useProjectStore } from "@/store/project";
import { scriptEvents, useRuntimeStore } from "@/store/runtime";

/**
 * Run: simulates the event of the selected script (or the first one), so the
 * program runs exactly as if that event happened. The menu lists every script.
 */
export function RunButton() {
  const program = useProjectStore((s) => s.program);
  const status = useRuntimeStore((s) => s.status);
  const queued = useRuntimeStore((s) => s.queued);
  const fire = useRuntimeStore((s) => s.fireScript);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const scripts = scriptEvents(program);

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

  const runDefault = () => {
    if (!scripts.length) {
      useProjectStore.getState().notify("info", "Add an event block (Events category) to give the program something to react to.");
      return;
    }
    const hat = selectedRootId();
    const chosen = scripts.find((s) => s.hatId && s.hatId === hat) ?? scripts.find((s) => !s.disabled) ?? scripts[0];
    fire(chosen.index);
  };

  const busy = status !== "idle";

  return (
    <div ref={root} className="relative flex">
      <button
        onClick={runDefault}
        title="Simulate the selected script's event (or the first script's)"
        className="inline-flex h-[30px] items-center gap-2 whitespace-nowrap rounded-l-md bg-signal pl-3.5 pr-3 font-mono text-xs font-medium tracking-[0.04em] text-signal-ink transition-[filter] hover:brightness-110"
      >
        {busy ? (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal-ink" aria-hidden />
        ) : (
          <span className="h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-signal-ink" aria-hidden />
        )}
        {busy ? (queued ? `Run +${queued}` : "Running") : "Run"}
      </button>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Choose an event to simulate"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-[30px] items-center rounded-r-md border-l border-signal-ink/20 bg-signal px-1.5 text-signal-ink hover:brightness-110"
      >
        <ChevronDownIcon width={13} height={13} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1.5 w-80 rounded-lg border border-line-2 bg-panel p-1 shadow-2xl shadow-black/60">
          <p className="px-2.5 pb-1 pt-1.5 font-mono text-[10.5px] tracking-[0.12em] text-dim">SIMULATE EVENT</p>
          {scripts.length === 0 && <p className="px-2.5 py-2 text-[13px] text-dim">No scripts yet. Start one with an event block.</p>}
          {scripts.map((s) => (
            <button
              key={s.index}
              role="menuitem"
              disabled={s.disabled}
              onClick={() => {
                setOpen(false);
                fire(s.index);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-fg-2 hover:bg-white/5 hover:text-fg disabled:opacity-40"
            >
              <span className="rounded-[3px] border border-[oklch(0.5_0.06_80)] px-1 font-mono text-[9.5px] leading-[13px] text-[oklch(0.8_0.09_80)]">EV</span>
              <span className="truncate">{s.label}</span>
            </button>
          ))}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              useProjectStore.getState().openDialog("backtest");
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-line px-2.5 py-2 text-left text-[13px] text-fg-2 hover:bg-white/5 hover:text-fg"
          >
            Backtest: if this had been running…
          </button>
          <p className="border-t border-line px-2.5 pb-1 pt-2 text-[11.5px] leading-snug text-dim">
            Events are simulated. Money never moves: finance blocks run against a simulated treasury.
          </p>
        </div>
      )}
    </div>
  );
}
