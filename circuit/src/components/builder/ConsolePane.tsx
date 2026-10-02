"use client";

/** Execution log under the canvas. Receipts stream in here once the runtime lands (Phase 3). */
export function ConsolePane() {
  return (
    <section className="flex h-[148px] shrink-0 flex-col border-t border-line bg-panel font-mono" aria-label="Console">
      <header className="flex items-center justify-between border-b border-line px-4 py-2 text-[11px] tracking-[0.12em] text-muted">
        <span>CONSOLE</span>
        <span className="flex items-center gap-4">
          <span className="text-[oklch(0.88_0.13_80)]/80">SIMULATED FINANCE</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#3a3d43]" />
            IDLE
          </span>
        </span>
      </header>
      <div className="flex-1 overflow-auto px-4 py-2.5 text-[12px] leading-relaxed">
        <p className="flex gap-3 text-fg-2">
          <span className="text-faint">--:--:--</span>
          Idle · waiting for a trigger
        </p>
      </div>
    </section>
  );
}
