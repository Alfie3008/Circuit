"use client";

import { useEffect, useState } from "react";
import { StaticBlocks } from "@/components/blocks/StaticBlocks";
import { DEBUG, DEBUG_ROWS } from "@/lib/marketing/demos";

const BEATS = 7;

/** "Watch it run": the debugger steps through the program, block by block. */
export function HomeDebug() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setP((x) => (x + 1) % BEATS), 1100);
    return () => clearInterval(id);
  }, []);
  const ids = DEBUG_ROWS.map((r) => r.id);
  const complete = p >= ids.length;

  return (
    <section className="border-t border-[#17191c] px-6 py-[120px]">
      <div className="mx-auto max-w-[1240px]">
        <h2 className="mt-2.5 text-[clamp(36px,5.4vw,72px)] font-medium leading-none tracking-[-0.045em]">Watch it run.</h2>
        <div className="mt-12 flex flex-wrap overflow-hidden rounded-[14px] border border-[#23252a] bg-panel">
          <div className="dot-canvas min-h-[440px] min-w-0 flex-[1.4_1_460px] overflow-auto p-10">
            <StaticBlocks program={DEBUG} active={complete ? null : ids[p]} done={ids.slice(0, Math.min(p, ids.length))} />
          </div>
          <div className="flex min-w-0 flex-[1_1_320px] flex-col border-l border-[#1f2125] font-mono text-[13px]">
            <div className="flex justify-between border-b border-[#1f2125] px-[18px] py-4 text-[11px] tracking-[0.12em]">
              <span>EXECUTION #0042</span>
              <span className={complete ? "text-ok" : "text-signal"}>{complete ? "✓ COMPLETE" : "● RUNNING"}</span>
            </div>
            <div className="border-b border-[#1f2125] px-[18px] py-2">
              {DEBUG_ROWS.map((r, i) => {
                const s = complete || i < p ? "✓" : i === p ? "RUNNING" : "WAITING";
                return (
                  <div key={r.id} className="flex justify-between py-2 transition-colors duration-200" style={{ color: s === "✓" ? "var(--color-ok)" : s === "RUNNING" ? "var(--color-signal)" : "#55585e" }}>
                    <span>{r.label}</span>
                    <span>{s}</span>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 px-[18px] py-4 text-fg-2">
              <span className="text-dim">incoming</span>
              <span className="text-fg">10 SOL</span>
              <span className="text-dim">state</span>
              <span className="text-fg">totalVolume {p === 0 ? "20" : "20 → 30"}</span>
              <span className="text-dim">agent</span>
              <span className="text-fg">{p < 2 ? "—" : p < 4 ? "creating…" : "Nori · otter"}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
