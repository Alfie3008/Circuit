"use client";

import { useEffect, useState } from "react";
import { Receipt, type ReceiptStep } from "./Receipt";
import { OK, SIG, simChip, valuePill } from "./tokens";

const CLAUSES: [string, number][] = [
  ["Every 10 SOL of volume,", 700],
  ["create an agent: a random cat, frog or penguin with an AI-generated name.", 1050],
  ["Pick a random stock from NVDA, TSLA, AAPL,", 1400],
  ["buy 0.03 SOL of it (simulated),", 1750],
  ["and add the agent to the world.", 2100],
];
const STEPS: ReceiptStep[] = [
  { label: "Volume reached", val: "100 SOL" },
  { label: "Agent", val: "Pip", tail: "created" },
  { label: "Species", val: "frog" },
  { label: "Asset selected", val: "TSLA" },
  { label: "Purchase", val: "0.03 SOL", sim: true },
  { label: "World updated" },
];
const EASE = "cubic-bezier(.2,.8,.2,1)";

/** One run from start to finish: trade → rule → effects → receipt → proof. Loops. (Design component; sample run.) */
export function WatchRun({ loopMs = 9000, onVerify }: { loopMs?: number; onVerify?: () => void }) {
  const [t, setT] = useState(0);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    const first = setTimeout(sync, 0);
    mq.addEventListener("change", sync);
    const id = setInterval(() => setT((x) => (x >= loopMs ? 0 : x + 50)), 50);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      mq.removeEventListener("change", sync);
    };
  }, [loopMs]);

  const on = (ms: number) => t >= ms;
  const transition = reduced ? "opacity .12s linear" : `opacity .32s ${EASE}, transform .32s ${EASE}`;
  const enter = (ms: number, dy?: number): React.CSSProperties => ({
    opacity: on(ms) ? 1 : 0,
    transform: reduced || on(ms) ? "none" : dy ? `translateY(${dy}px)` : "scale(.96)",
    transition,
  });
  const active = CLAUSES.reduce((a, c, i) => (t >= c[1] ? i : a), -1);
  const settled = t >= 2600;
  const rcProg = Math.max(0, Math.min(6, Math.floor((t - 2600) / 110)));
  const label = "font-mono text-[10.5px] tracking-[0.12em] text-dim";
  const effect = "flex items-center justify-between gap-2 rounded-[10px] border border-[#23252a] bg-panel px-3 py-[9px] text-[13.5px]";

  return (
    <div
      className="flex min-w-0 flex-col gap-[22px] rounded-2xl border border-[#1f2125] p-6 font-sans text-fg"
      style={{ backgroundColor: "#0e0f11", backgroundImage: "radial-gradient(circle,#ffffff10 1px,transparent 1.3px)", backgroundSize: "22px 22px" }}
    >
      <div className="flex gap-1">
        {[0, 700, 1200, 2600].map((ms, i) => (
          <span key={ms} className="h-0.5 flex-1 rounded-[1px]" style={{ background: on(ms) ? (settled && i < 3 ? OK : SIG) : "#23252a", transition: reduced ? "none" : "background .2s" }} />
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5">
          <div className={label}>01 · TRANSACTION</div>
          <div className="flex flex-col gap-[9px] rounded-xl border border-ok/40 bg-panel p-4 shadow-[0_0_30px_-10px_oklch(0.80_0.13_155_/_.4)]" style={enter(0, -12)}>
            <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.12em] text-ok">
              <span className="h-1.5 w-1.5 rounded-[3px] bg-ok shadow-[0_0_8px_oklch(0.80_0.13_155)]" />
              LIVE · SOLANA
            </span>
            <div className="text-[28px] font-medium tracking-[-0.03em]">Buy 10.0 SOL</div>
            <div className="font-mono text-[11.5px] text-fg-2">by 9pRt…Ue2c · 14:21:07 UTC</div>
            <div className="font-mono text-[11px] text-dim">tx 2Wq8…Lm4e · Solscan ↗</div>
            <div className="mt-1">
              <div className="mb-1.5 flex justify-between font-mono text-[10.5px] text-dim">
                <span>VOLUME</span>
                <span>{on(400) ? "100.0 / 100 SOL" : "90.0 / 100 SOL"}</span>
              </div>
              <div className="h-[5px] overflow-hidden rounded-[3px] bg-[#1d1f23]">
                <div className="h-full bg-signal" style={{ width: on(400) ? "100%" : "90%", transition: reduced ? "none" : "width .3s ease-out" }} />
              </div>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-[1.4_1_320px] flex-col gap-2.5">
          <div className={label}>02 · THE RULE IT TRIGGERS</div>
          <div className="rounded-xl border border-[#23252a] bg-panel px-5 py-[18px] text-[clamp(17px,1.7vw,21px)] leading-[1.6] tracking-[-0.01em] text-pretty">
            {CLAUSES.map(([text], i) => {
              const lit = i <= active;
              const cur = i === active && !settled;
              return (
                <span key={i}>
                  <span
                    className="rounded-[5px] px-[3px] py-px"
                    style={{
                      color: lit ? "#e8e6e1" : "#55585e",
                      background: cur ? "oklch(0.84 0.15 80 / .16)" : "transparent",
                      boxShadow: cur ? "0 0 0 1px oklch(0.84 0.15 80 / .5)" : "none",
                      transition: reduced ? "none" : "background .2s, color .2s, box-shadow .2s",
                    }}
                  >
                    {text}
                  </span>{" "}
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5">
          <div className={label}>03 · WHAT HAPPENED</div>
          <div className="flex items-center gap-3 rounded-xl border border-signal/45 bg-panel p-3" style={enter(1200)}>
            <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-lg border border-[#23252a] bg-raised shadow-[inset_0_-12px_20px_-12px_oklch(0.84_0.15_80_/_.6)]">
              <pre className="m-0 font-mono text-[9px] leading-[1.1] text-[oklch(0.88_0.12_80)]">{"  @..@\n (----)\n( >__< )"}</pre>
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-[0.12em] text-signal">AGENT BORN</div>
              <div className="mt-0.5 text-[19px] font-medium">{on(1350) ? "Pip" : "…"}</div>
              <div className="text-[12.5px] text-fg-2">Frog · Anxious day trader</div>
            </div>
          </div>
          <div className={effect} style={enter(1550, 8)}>
            <span>Picked a stock</span>
            <span className={valuePill}>TSLA</span>
          </div>
          <div className={effect} style={enter(1900, 8)}>
            <span>Bought 0.03 SOL of TSLA</span>
            <span className={simChip}>SIMULATED</span>
          </div>
          <div className={effect} style={enter(2250, 8)}>
            <span>Joined the world</span>
            <span className="font-mono text-[11.5px] text-fg-2">{on(2250) ? 22 : 21} agents</span>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[620px]" style={enter(2600, 16)}>
        <div className={`${label} mb-2.5 text-center`}>04 · RECEIPT</div>
        <Receipt
          exec="0043"
          time="14:21:07 UTC"
          amount="10.0 SOL"
          wallet="9pRt…Ue2c"
          tx="2Wq8…Lm4e"
          steps={STEPS}
          status={rcProg >= 6 ? "complete" : "running"}
          progress={rcProg}
          proof={on(5200) ? "anchored" : "pending"}
          onVerify={onVerify}
        />
      </div>
    </div>
  );
}
