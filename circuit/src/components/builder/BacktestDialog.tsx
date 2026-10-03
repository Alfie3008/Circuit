"use client";

import { useEffect, useRef, useState } from "react";
import { RealReceipt } from "@/components/runtime/RealReceipt";
import { clock, num } from "@/components/runtime/format";
import { backtest, simulatedHistory, type BacktestResult, type TimelinePoint } from "@/lib/backtest/backtest";
import { fetchHistory } from "@/lib/chain/client";
import { isAddress } from "@/lib/chain/parse";
import { useProjectStore } from "@/store/project";
import { useRuntimeStore } from "@/store/runtime";

// Validated (dataviz validator, dark surface #111214): muted blue for trades,
// amber for trades that triggered the program.
const TRADE = "#2473a2";
const RAN = "#c38300";

/** Trades over time as columns (height = SOL); amber where the program ran. */
function Timeline({ points }: { points: TimelinePoint[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!points.length) return <p className="text-[13px] text-dim">No trades in this window.</p>;
  const H = 150;
  const pad = { l: 36, r: 8, t: 8, b: 22 };
  const plotW = Math.max(100, width - pad.l - pad.r);
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t || t0 + 1;
  const max = Math.max(...points.map((p) => p.amount), 0.001);
  const nice = (() => {
    const step = 10 ** Math.floor(Math.log10(max));
    return Math.ceil(max / step) * step;
  })();
  const x = (t: number) => pad.l + (t1 === t0 ? plotW / 2 : ((t - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => pad.t + (1 - v / nice) * (H - pad.t - pad.b);
  const barW = Math.max(1.5, Math.min(6, plotW / points.length - 1));
  const hovered = hover !== null ? points[hover] : null;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i].t) - px) < Math.abs(x(points[best].t) - px)) best = i;
    setHover(best);
  };

  return (
    <div ref={box} className="relative">
      <div className="mb-2 flex gap-4 font-mono text-[11px] text-fg-2">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: TRADE }} />
          Trade
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: RAN }} />
          Triggered the program
        </span>
      </div>
      <svg width={width} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`${points.length} trades over time; ${points.filter((p) => p.ran.length).length} triggered the program`}>
        {[0, nice / 2, nice].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke="#1f2125" strokeWidth={1} />
            <text x={pad.l - 6} y={y(v)} textAnchor="end" dominantBaseline="central" fill="#6d7076" fontSize={10} fontFamily="var(--font-mono)">
              {num(v, 2)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const h = Math.max(1.5, y(0) - y(p.amount));
          return (
            <rect
              key={i}
              x={x(p.t) - barW / 2}
              y={y(0) - h}
              width={barW}
              height={h}
              rx={Math.min(2, barW / 2)}
              fill={p.ran.length ? RAN : TRADE}
              opacity={hover === null || hover === i ? 1 : 0.55}
            />
          );
        })}
        <text x={pad.l} y={H - 6} fill="#6d7076" fontSize={10} fontFamily="var(--font-mono)">
          {new Date(t0).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </text>
        <text x={width - pad.r} y={H - 6} textAnchor="end" fill="#6d7076" fontSize={10} fontFamily="var(--font-mono)">
          {new Date(t1).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </text>
        <text x={4} y={pad.t + 2} fill="#6d7076" fontSize={9.5} fontFamily="var(--font-mono)" dominantBaseline="hanging">
          SOL
        </text>
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-lg border border-line-2 bg-raised px-3 py-2 text-[12px] shadow-xl shadow-black/50"
          style={{ left: Math.min(Math.max(0, x(hovered.t) - 112), width - 224), top: 24 }}
        >
          <p className="font-mono text-[11px] text-dim">{clock(hovered.t)}</p>
          <p>
            {hovered.side === "buy" ? "Buy" : "Sell"} · {num(hovered.amount, 3)} SOL
          </p>
          {hovered.ran.length ? (
            <p className="mt-1 text-fg-2">Ran: {hovered.ran.join(", ")}</p>
          ) : (
            <p className="mt-1 text-dim">The program didn&apos;t react.</p>
          )}
        </div>
      )}
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function BacktestDialog() {
  const program = useProjectStore((s) => s.program);
  const setup = useProjectStore((s) => s.setup);
  const current = useProjectStore((s) => s.current);
  const chain = useRuntimeStore((s) => s.chainStatus);
  const close = () => useProjectStore.getState().openDialog(null);
  const canReal = !!chain?.enabled;
  const [mint, setMint] = useState(setup.tokenAddress);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState<{ label: string; done: number; total: number } | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [usedSource, setUsedSource] = useState<"real" | "sim">("sim");
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && useProjectStore.getState().openDialog(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const run = async (source: "real" | "sim", window = hours) => {
    if (!program) return setError("The program has an error, so it can't be backtested yet.");
    setError(null);
    setResult(null);
    setUsedSource(source);
    try {
      let events;
      if (source === "real") {
        if (!isAddress(mint)) return setError("Paste a token mint address.");
        if (!canReal) return setError("This server has no Solana connection (HELIUS_API_KEY or CIRCUIT_SOLANA_RPC_URL), so real trades can't be read.");
        setBusy({ label: "Reading past trades from Solana…", done: 0, total: 0 });
        const h = await fetchHistory(mint, window, window > 24 ? 1000 : 300);
        events = h.events;
        if (h.truncated) setError(`Only the most recent ${h.scanned} transactions were read; the window started earlier.`);
      } else {
        events = simulatedHistory(window, Date.now() % 100_000);
      }
      const label = `Replaying ${events.length.toLocaleString()} events from the last ${window === 24 ? "24 hours" : "7 days"}`;
      setBusy({ label, done: 0, total: events.length });
      const r = await backtest(program, events, { onProgress: (done, total) => setBusy({ label, done, total }) });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const card = "flex flex-col gap-4 rounded-xl border border-[#1f2125] bg-panel p-5";
  const ghost = "h-10 cursor-pointer rounded-lg border border-[#34363c] bg-panel px-4 text-[14px] text-fg hover:bg-white/[0.03]";
  const pct = busy && busy.total ? Math.round((busy.done / busy.total) * 100) : 0;
  const window = hours === 24 ? "24 hours" : "7 days";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(5,6,7,.74)] p-6 backdrop-blur-[6px]" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label="Backtest" className="relative max-h-full w-[980px] max-w-full overflow-auto rounded-2xl border border-[#2a2c31] bg-ink">
        <button onClick={close} aria-label="Close" className="absolute right-[18px] top-4 z-[2] cursor-pointer font-mono text-[12px] text-fg-2 hover:text-fg">
          ✕
        </button>
        <div className="flex min-w-0 flex-col gap-4 px-5 pb-8 pt-6 font-sans text-fg">
          <div className="flex flex-wrap items-end justify-between gap-3 pr-8">
            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-dim">BACKTEST · {current?.name}</div>
              <h2 className="mt-2 text-[clamp(22px,2.6vw,30px)] font-medium tracking-[-0.03em]">{hours === 24 ? "If this ran yesterday" : "If this ran this week"}</h2>
            </div>
            <div className="flex gap-0.5 rounded-[7px] border border-[#23252a] bg-canvas p-0.5">
              {[24, 168].map((h) => (
                <button
                  key={h}
                  onClick={() => setHours(h)}
                  disabled={!!busy}
                  className="h-[26px] cursor-pointer rounded-[5px] px-2.5 font-mono text-[11px]"
                  style={{ background: h === hours ? "#22252a" : "transparent", color: h === hours ? "#e8e6e1" : "#6d7076" }}
                >
                  {h === 24 ? "24 hours" : "7 days"}
                </button>
              ))}
            </div>
          </div>

          {!busy && !result && (
            <div className={card}>
              <div className="max-w-[560px] text-[15px] leading-normal text-fg-2 text-pretty">
                Replay real trades from a pump.fun coin through your program. Nothing is sent, bought or written to Solana, and your project&apos;s state isn&apos;t touched.
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex h-[42px] min-w-0 flex-[1_1_260px] items-center gap-2.5 rounded-lg border border-[#2a2c31] bg-canvas px-3">
                  <span className="font-mono text-[12.5px] text-dim">MINT</span>
                  <input
                    value={mint}
                    onChange={(e) => setMint(e.target.value.trim())}
                    placeholder="Paste a mint address…"
                    className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-fg placeholder:text-faint focus:outline-none"
                  />
                </label>
                <button onClick={() => void run("real")} className="h-[42px] cursor-pointer rounded-lg bg-signal px-[18px] text-[14px] font-medium text-signal-ink hover:brightness-[1.08]">
                  Run backtest
                </button>
              </div>
              {!canReal && <p className="-mt-2 m-0 font-mono text-[11px] text-dim">This server can&apos;t read Solana yet (no HELIUS_API_KEY or CIRCUIT_SOLANA_RPC_URL). The simulated market works without one.</p>}
              <div className="font-mono text-[10.5px] tracking-[0.12em] text-dim">OR PICK ONE</div>
              <div className="flex flex-col gap-1.5">
                {isAddress(setup.tokenAddress) && (
                  <button
                    onClick={() => {
                      setMint(setup.tokenAddress);
                      void run("real");
                    }}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-signal/35 bg-canvas px-3 py-2.5 text-left hover:border-signal/50"
                  >
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border border-[#2a2c31] font-mono text-[10px] text-[oklch(0.86_0.1_80)]">
                      {(current?.name ?? "C").slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px]">
                        {current?.name} {setup.tokenSymbol && <span className="font-mono text-[11.5px] text-dim">${setup.tokenSymbol}</span>}
                      </div>
                      <div className="font-mono text-[11px] text-faint">{setup.tokenAddress.slice(0, 4)}…{setup.tokenAddress.slice(-4)} · real trades</div>
                    </div>
                    <span className="font-mono text-[11px] text-dim">YOURS</span>
                  </button>
                )}
                <button onClick={() => void run("sim")} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#23252a] bg-canvas px-3 py-2.5 text-left hover:border-signal/50">
                  <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border border-[#2a2c31] font-mono text-[10px] text-[oklch(0.86_0.1_80)]">SM</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px]">Simulated market</div>
                    <div className="font-mono text-[11px] text-faint">A plausible {window} for a young coin: bursts, lulls, mostly small trades</div>
                  </div>
                  <span className="font-mono text-[11px] text-dim">NO KEY NEEDED</span>
                </button>
              </div>
              {error && <p className="m-0 text-[13px] text-err">{error}</p>}
            </div>
          )}

          {busy && (
            <div className={card}>
              <div className="flex flex-wrap justify-between gap-3 text-[15px]">
                <span>{busy.label}</span>
                <span className="font-mono text-[13px] text-signal">{busy.total ? `${pct}%` : "…"}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-[3px] bg-[#1d1f23]">
                <div className="h-full bg-signal transition-[width] duration-200" style={{ width: `${pct}%` }} />
              </div>
              <div className="font-mono text-[12px] text-dim">
                {busy.done.toLocaleString()} / {busy.total.toLocaleString()} events · AI answers are mocks, so this costs nothing
              </div>
            </div>
          )}

          {result && result.executions === 0 && (
            <div className={card}>
              <div className="text-[clamp(18px,2vw,22px)] font-medium tracking-[-0.02em]">Nothing would have happened.</div>
              <div className="max-w-[620px] text-[14.5px] leading-[1.55] text-fg-2 text-pretty">
                {result.note ?? "None of the program's events happened in this window."} {result.trades.toLocaleString()} trades and {num(result.volumeSol, 1)} SOL of volume in the last {window}.
              </div>
              <div className="flex flex-wrap gap-2">
                {hours === 24 && (
                  <button
                    onClick={() => {
                      setHours(168);
                      void run(usedSource, 168);
                    }}
                    className={ghost}
                  >
                    Replay 7 days instead
                  </button>
                )}
                <button onClick={() => setResult(null)} className={ghost}>
                  Try another coin
                </button>
              </div>
            </div>
          )}

          {result && result.executions > 0 && (
            <div className={card}>
              <p className="m-0 text-[clamp(17px,2vw,21px)] leading-normal tracking-[-0.01em] text-pretty">
                Would have run <b className="font-medium text-signal">{plural(result.executions, "time")}</b>, created{" "}
                <b className="font-medium text-signal">{plural(result.agentsCreated, "agent")}</b>, made{" "}
                <b className="font-medium">
                  {plural(result.aiCalls, "AI call")} ≈ ${result.estAiCostUsd.toFixed(2)}
                </b>
                , while earning <b className="font-medium text-ok">≈ {num(result.estCreatorFeesSol, 2)} SOL</b> in creator fees.
              </p>
              <div className="font-mono text-[10.5px] tracking-[0.1em] text-dim">
                {result.trades.toLocaleString()} TRADES · {usedSource === "real" ? "REAL TRADES" : "SIMULATED MARKET"} · CREATOR FEES ESTIMATED AT 0.3%
              </div>
              {result.errors > 0 && <p className="m-0 text-[13px] text-err">{result.errors} runs ended in an error. Their receipts below say why.</p>}
              {error && <p className="m-0 text-[13px] text-[oklch(0.88_0.13_80)]">{error}</p>}
              <Timeline points={result.timeline} />
              <div className="flex flex-col gap-1.5">
                <div className="font-mono text-[10.5px] tracking-[0.12em] text-dim">WOULD-BE RECEIPTS</div>
                {[...result.receipts]
                  .reverse()
                  .slice(0, 6)
                  .map((r) =>
                    openId === r.id ? (
                      <div key={r.id} onClick={() => setOpenId(null)} className="cursor-pointer">
                        <RealReceipt r={r} backtest />
                      </div>
                    ) : (
                      <RealReceipt key={r.id} r={r} size="row" backtest onOpen={() => setOpenId(r.id)} />
                    ),
                  )}
                {result.executions > 6 && <span className="py-1 font-mono text-[11px] text-dim">+ {result.executions - 6} more</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => useProjectStore.getState().openDialog("golive")}
                  className="h-10 cursor-pointer rounded-lg bg-signal px-4 text-[14px] font-medium text-signal-ink hover:brightness-[1.08]"
                >
                  Continue to go live →
                </button>
                <button onClick={() => setResult(null)} className={ghost}>
                  Try another coin
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
