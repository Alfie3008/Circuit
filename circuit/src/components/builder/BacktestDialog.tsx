"use client";

import { useEffect, useRef, useState } from "react";
import { XIcon } from "@/components/ui/icons";
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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#23252a] bg-raised px-3 py-2.5">
      <p className="font-mono text-[10.5px] tracking-[0.1em] text-dim">{label}</p>
      <p className="mt-0.5 text-[22px] font-semibold tracking-[-0.02em]">{value}</p>
      {sub && <p className="text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

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

export function BacktestDialog() {
  const program = useProjectStore((s) => s.program);
  const setup = useProjectStore((s) => s.setup);
  const chain = useRuntimeStore((s) => s.chainStatus);
  const close = () => useProjectStore.getState().openDialog(null);
  const canReal = !!chain?.enabled;
  const [source, setSource] = useState<"real" | "sim">(canReal && isAddress(setup.tokenAddress) ? "real" : "sim");
  const [mint, setMint] = useState(setup.tokenAddress);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const run = async () => {
    if (!program) return setError("The program has an error, so it can't be backtested yet.");
    setError(null);
    setResult(null);
    try {
      let events;
      if (source === "real") {
        if (!isAddress(mint)) return setError("Paste a token mint address.");
        setBusy("Reading past trades from Solana…");
        const h = await fetchHistory(mint, hours, hours > 24 ? 1000 : 300);
        events = h.events;
        if (h.truncated) setError(`Only the most recent ${h.scanned} transactions were read; the window started earlier.`);
      } else {
        events = simulatedHistory(hours, Date.now() % 100_000);
      }
      setBusy(`Replaying ${events.length} events…`);
      const r = await backtest(program, events, { onProgress: (d, t) => setBusy(`Replaying ${d} / ${t} events…`) });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const seg = (on: boolean) => `rounded-md px-2.5 py-1 font-mono text-[11.5px] transition-colors ${on ? "bg-white/10 text-fg" : "text-dim hover:text-fg-2"}`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label="Backtest" className="flex max-h-[90vh] w-[820px] max-w-full flex-col overflow-hidden rounded-[14px] border border-[#23252a] bg-panel shadow-2xl shadow-black/60">
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-mono text-[12px] tracking-[0.14em] text-muted">BACKTEST · IF THIS PROGRAM HAD BEEN RUNNING</h2>
          <button onClick={close} aria-label="Close" className="rounded p-1 text-dim hover:text-fg">
            <XIcon width={14} height={14} />
          </button>
        </header>
        <div className="flex flex-col gap-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-line-2 p-0.5" role="radiogroup" aria-label="Trades to replay">
              <button role="radio" aria-checked={source === "real"} disabled={!canReal} className={seg(source === "real")} onClick={() => setSource("real")} title={canReal ? "" : "Needs HELIUS_API_KEY or CIRCUIT_SOLANA_RPC_URL"}>
                Real token
              </button>
              <button role="radio" aria-checked={source === "sim"} className={seg(source === "sim")} onClick={() => setSource("sim")}>
                Simulated market
              </button>
            </div>
            {source === "real" && (
              <input
                value={mint}
                onChange={(e) => setMint(e.target.value.trim())}
                placeholder="Token mint address"
                aria-label="Token mint address"
                className="h-8 min-w-0 flex-1 rounded-md border border-line-2 bg-canvas px-2.5 font-mono text-[12px] text-fg placeholder:text-faint focus:border-signal/60 focus:outline-none"
              />
            )}
            <div className="flex rounded-lg border border-line-2 p-0.5" role="radiogroup" aria-label="Window">
              <button role="radio" aria-checked={hours === 24} className={seg(hours === 24)} onClick={() => setHours(24)}>
                24 hours
              </button>
              <button role="radio" aria-checked={hours === 168} className={seg(hours === 168)} onClick={() => setHours(168)}>
                7 days
              </button>
            </div>
            <button onClick={() => void run()} disabled={!!busy} className="ml-auto h-8 rounded-md bg-signal px-3.5 font-mono text-[12px] font-medium text-signal-ink hover:brightness-110 disabled:opacity-60">
              {busy ? "Running…" : "Run backtest"}
            </button>
          </div>
          <p className="text-[12.5px] leading-snug text-dim">
            {source === "real"
              ? "Replays the token's real past trades through this program. Nothing is sent or spent: AI answers are mocks and finance is simulated. Your project's state isn't touched."
              : "Replays a plausible trading day for a young coin (bursts, lulls, mostly small trades). Your project's state isn't touched."}
          </p>

          {busy && <p className="font-mono text-[12px] text-signal">{busy}</p>}
          {error && <p className="text-[13px] text-err">{error}</p>}

          {result && (
            <>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
                <Stat label="RUNS" value={String(result.executions)} sub={`from ${result.trades} trades`} />
                <Stat label="AGENTS CREATED" value={String(result.agentsCreated)} sub={`${result.feedPosts} feed posts`} />
                <Stat label="AI CALLS" value={String(result.aiCalls)} sub={`≈ $${result.estAiCostUsd.toFixed(3)} with real AI`} />
                <Stat label="CREATOR FEES" value={`${num(result.estCreatorFeesSol, 3)} SOL`} sub={`est. 0.3% of ${num(result.volumeSol, 1)} SOL volume`} />
              </div>
              {result.note && <p className="rounded-lg border border-line-2 bg-raised p-3 text-[13px] text-fg-2">{result.note}</p>}
              {result.errors > 0 && <p className="text-[13px] text-err">{result.errors} runs ended in an error. Their receipts below say why.</p>}
              <Timeline points={result.timeline} />
              <div>
                <p className="mb-1.5 font-mono text-[10.5px] tracking-[0.12em] text-dim">WOULD-BE RECEIPTS · LATEST {result.receipts.length}</p>
                <div className="flex flex-col gap-1">
                  {[...result.receipts].reverse().map((r) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-md border border-[#23252a] px-3 py-1.5 font-mono text-[12px]">
                      <span className="text-dim">{clock(r.startedAt)}</span>
                      <span className="min-w-0 flex-1 truncate text-fg-2">
                        {r.event.label} → {r.entries.slice(1).map((e) => e.text).join(" · ")}
                      </span>
                      {r.event.proof ? (
                        <a href={r.event.proof.explorer} target="_blank" rel="noreferrer" className="shrink-0 text-ok hover:underline">
                          tx ↗
                        </a>
                      ) : (
                        <span className="shrink-0 text-[10.5px] tracking-[0.08em] text-[oklch(0.88_0.13_80)]/80">BACKTEST</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
