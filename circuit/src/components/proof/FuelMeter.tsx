"use client";

import { useState } from "react";
import { ERR, OK, SIG, alpha } from "./tokens";

const BASE = { healthy: 0.29, low: 0.05, empty: 0 };
const BURN_PER_DAY = 0.07;

/** AI fuel: what the coin's creator fees put in, what AI calls burn, and the days left. (Design component; sample figures.) */
export function FuelMeter({ size = "panel", state = "healthy", compact }: { size?: "panel" | "chip"; state?: keyof typeof BASE; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const chip = size === "chip";
  const bal = BASE[state];
  const days = bal / BURN_PER_DAY;
  const st = bal <= 0.001 ? "empty" : days < 1 ? "low" : "healthy";
  const color = { healthy: OK, low: SIG, empty: ERR }[st];
  const n = chip ? 5 : 14;
  const filled = Math.ceil(Math.min(1, days / 7) * n);
  const big = st === "empty" ? "Empty" : days < 1 ? `${Math.round(days * 24)} hours left` : `${days.toFixed(1)} days left`;
  const note = {
    healthy: "Paid by this coin's creator fees. If it runs out, AI blocks pause or use simple fallbacks. Nothing else stops.",
    low: "Less than a day left at the current rate. When it hits zero, AI blocks pause or use simple fallbacks. Trades, agents and the world keep running.",
    empty: "AI blocks are paused. New agents get a default name and personality. Trades, agents and the world keep running.",
  }[st];
  const segs = Array.from({ length: n }, (_, i) => (i < filled ? color : "#23252a"));

  const panel = (
    <div
      className={`${chip ? "absolute right-0 top-10 z-[80] w-[340px] border-[#2a2c31] shadow-[0_24px_48px_-16px_#000]" : "relative border-[#1f2125]"} flex flex-col gap-3.5 rounded-xl border bg-panel px-[18px] py-4`}
    >
      <div className="flex items-center justify-between font-mono text-[10.5px] tracking-[0.12em] text-dim">
        <span>AI FUEL</span>
        <span className="inline-flex items-center gap-1.5" style={{ color }}>
          <span className="h-1.5 w-1.5 rounded-[3px]" style={{ background: color }} />
          {st.toUpperCase()}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2.5">
        <span className="text-[30px] font-medium tracking-[-0.03em]" style={{ color: st === "empty" ? ERR : "#e8e6e1" }}>
          {big}
        </span>
        <span className="font-mono text-[12px] text-fg-2">{bal.toFixed(2)} SOL</span>
      </div>
      <div className="flex gap-[3px]">
        {segs.map((c, i) => (
          <span key={i} className="h-2 flex-1 rounded-[2px] transition-colors duration-300" style={{ background: c }} />
        ))}
      </div>
      <div className="flex flex-col font-mono text-[11.5px]">
        <div className="flex justify-between border-t border-[#1d1f23] py-[7px]">
          <span className="text-dim">In · creator fees</span>
          <span className="text-ok">+0.31 SOL / day</span>
        </div>
        <div className="flex justify-between border-t border-[#1d1f23] py-[7px]">
          <span className="text-dim">Burn · AI calls</span>
          <span>0.07 SOL / day · ~180 calls</span>
        </div>
      </div>
      <div className="text-[13px] leading-normal text-fg-2 text-pretty">{note}</div>
    </div>
  );

  if (!chip) return panel;
  return (
    <div className="relative min-w-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap rounded-[7px] border px-2.5 font-mono text-[11.5px] text-[#c9c7c2] hover:border-[#3a3d43]"
        style={{ borderColor: st === "healthy" ? "#2c2f35" : alpha(color, 0.5), background: st === "healthy" ? "transparent" : alpha(color, 0.07) }}
      >
        {!compact && <span className="text-[10px] tracking-[0.1em] text-muted">AI FUEL</span>}
        <span className="flex gap-0.5">
          {segs.map((c, i) => (
            <span key={i} className="h-3 w-1 rounded-[1px]" style={{ background: c }} />
          ))}
        </span>
        <span style={{ color }}>{st === "empty" ? "0" : days < 1 ? `${Math.round(days * 24)}h` : `${days.toFixed(1)}d`}</span>
      </button>
      {open && panel}
    </div>
  );
}
