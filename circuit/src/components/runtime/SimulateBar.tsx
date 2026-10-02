"use client";

import { PRESETS, programTriggers } from "@/lib/runtime/events";
import { useProjectStore } from "@/store/project";
import { useRuntimeStore } from "@/store/runtime";

const chip =
  "h-[26px] rounded-md border border-line-2 bg-canvas px-2 font-mono text-[11px] tracking-[0.02em] text-fg-2 transition-colors hover:border-signal/50 hover:text-fg";

/**
 * Event simulator: each button produces a normalized event (the same shape a
 * live Solana feed will produce) and every script that listens reacts.
 */
export function SimulateBar() {
  const program = useProjectStore((s) => s.program);
  const firePreset = useRuntimeStore((s) => s.firePreset);
  const fireEvent = useRuntimeStore((s) => s.fireEvent);
  const liveSim = useRuntimeStore((s) => s.liveSim);
  const setLiveSim = useRuntimeStore((s) => s.setLiveSim);
  const custom = program ? programTriggers(program) : [];

  return (
    <section className="border-b border-line px-3 pb-3 pt-2.5" aria-label="Simulate events">
      <div className="mb-2 flex items-center justify-between font-mono text-[11px] tracking-[0.12em] text-muted">
        <span>SIMULATE</span>
        <button
          onClick={() => setLiveSim(!liveSim)}
          aria-pressed={liveSim}
          title="A market that trades by itself every few seconds, plus real timers for “every X minutes” and “at time” scripts. Runs while this tab is open."
          className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${liveSim ? "bg-ok/10 text-ok" : "text-dim hover:text-fg-2"}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${liveSim ? "animate-pulse bg-ok" : "bg-[#3a3d43]"}`} />
          {liveSim ? "LIVE" : "GO LIVE"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button key={p.id} className={chip} title={p.hint} onClick={() => firePreset(p.id)}>
            {p.label}
          </button>
        ))}
        {custom.map((t) => (
          <button key={t.label} className={`${chip} border-signal/30 text-[oklch(0.88_0.13_80)]`} title="An event your program defines" onClick={() => fireEvent(t.event())}>
            {t.label}
          </button>
        ))}
      </div>
    </section>
  );
}
