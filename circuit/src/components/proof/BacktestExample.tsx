"use client";

import { useState } from "react";
import { Receipt } from "./Receipt";

const MARKED = [9, 22, 37, 48, 61, 74, 88];

/** Fixed sample timeline (seeded, so it's the same every render). */
const BARS = (() => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 96 }, (_, i) => {
    const v = Math.pow(rnd(), 2.4);
    const run = rnd() < 0.36;
    const agent = MARKED.includes(i);
    return { h: Math.round(8 + v * 92), c: agent ? "oklch(0.84 0.15 80)" : run ? "oklch(0.55 0.05 235)" : "#2a2c31", agent };
  });
})();

/** The backtest result, as shown in the docs (sample figures). */
export function BacktestExample({ onOpenReceipt }: { onOpenReceipt?: () => void }) {
  const [win, setWin] = useState<"24h" | "7d">("24h");
  const rows = [
    { t: "13:58:02", l: "Buy 10.4 SOL → a penguin would have been created" },
    { t: "09:12:47", l: "Buy 2.0 SOL → counted, 1.1 SOL to the next agent" },
    { t: "02:40:19", l: "Buy 11.3 SOL → a frog would have been created" },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4 bg-ink px-5 pb-8 pt-6 font-sans text-fg">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10.5px] tracking-[0.12em] text-dim">BACKTEST · LIVING-CREW · EXAMPLE</div>
          <h2 className="mt-2 text-[clamp(22px,2.6vw,30px)] font-medium tracking-[-0.03em]">If this ran yesterday</h2>
        </div>
        <div className="flex gap-0.5 rounded-[7px] border border-[#23252a] bg-canvas p-0.5">
          {(["24h", "7d"] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWin(w)}
              className="h-[26px] cursor-pointer rounded-[5px] px-2.5 font-mono text-[11px]"
              style={{ background: w === win ? "#22252a" : "transparent", color: w === win ? "#e8e6e1" : "#6d7076" }}
            >
              {w === "24h" ? "24 hours" : "7 days"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-[18px] rounded-xl border border-[#1f2125] bg-panel p-5">
        <p className="m-0 text-[clamp(17px,2vw,21px)] leading-normal tracking-[-0.01em] text-pretty">
          Would have run <b className="font-medium text-signal">37 times</b>, created <b className="font-medium text-signal">7 agents</b>, made{" "}
          <b className="font-medium">41 AI calls ≈ $0.04</b>, while earning <b className="font-medium text-ok">≈ 3.1 SOL</b> in creator fees.
        </p>
        <div>
          <div className="mb-2 flex justify-between font-mono text-[10.5px] tracking-[0.1em] text-dim">
            <span>1,284 TRADES · $CREW</span>
            <span className="flex gap-3">
              <span className="text-signal">▲ AGENT CREATED</span>
              <span className="text-var">● RUN</span>
            </span>
          </div>
          <div className="relative flex h-24 items-end gap-px border-b border-[#2a2c31] pt-4">
            {BARS.map((b, i) => (
              <div key={i} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                {b.agent && <span className="absolute -top-3.5 text-[9px] leading-none text-signal">▲</span>}
                <div className="w-full rounded-t-[1px]" style={{ height: `${b.h}%`, background: b.c }} />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-faint">
            <span>YESTERDAY 14:00</span>
            <span>20:00</span>
            <span>02:00</span>
            <span>08:00</span>
            <span>NOW</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="font-mono text-[10.5px] tracking-[0.12em] text-dim">WOULD-BE RECEIPTS</div>
          {rows.map((r) => (
            <Receipt key={r.t} size="row" source="backtest" time={r.t} line={r.l} onOpen={onOpenReceipt} />
          ))}
          <span className="py-1 font-mono text-[11px] text-dim">+ 34 more</span>
        </div>
      </div>
    </div>
  );
}
