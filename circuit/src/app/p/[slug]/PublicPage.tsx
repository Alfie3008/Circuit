"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AgentsPanel, FeedPanel, RunsPanel, WorldPanel } from "@/components/runtime/Panels";
import { Words } from "@/components/runtime/Words";
import { solscanAccount } from "@/lib/chain/parse";
import { explainProgram } from "@/lib/explain/explain";
import { initialState, type RuntimeState } from "@/lib/runtime/state";
import type { PublicProject } from "@/lib/server/publicView";

const POLL_MS = 10_000;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

function ago(t: number | null, now: number) {
  if (!t) return "never";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#23252a] bg-panel px-4 py-3">
      <span className="block font-mono text-[10.5px] tracking-[0.12em] text-dim">{label}</span>
      <span className="mt-1 block font-mono text-[20px] tabular-nums text-fg">{value}</span>
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-[14px] border border-[#23252a] bg-panel">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted">{title}</h2>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PublicPage({ initial }: { initial: PublicProject }) {
  const [view, setView] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [stale, setStale] = useState(false);

  // Live updates: poll while the tab is visible.
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/p/${initial.slug}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as PublicProject;
        if (alive) {
          setView(next);
          setStale(false);
        }
      } catch {
        if (alive) setStale(true);
      }
      if (alive) setNow(Date.now());
    };
    const id = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [initial.slug]);

  const rules = useMemo(() => explainProgram(view.program), [view.program]);
  // The panels read a runtime state; build one from the public view.
  const state = useMemo<RuntimeState>(
    () => ({
      ...initialState(1),
      agents: view.world.agents,
      entities: view.world.entities,
      feed: view.world.feed,
      market: view.world.market,
      treasury: view.world.treasury,
      executionCount: view.world.executions,
      runs: [...view.receipts].reverse(),
    }),
    [view],
  );
  const m = view.world.market;

  return (
    <div className="min-h-screen bg-ink text-fg">
      <nav className="flex h-[52px] items-center gap-3 border-b border-[#1d1f23] px-4 sm:px-6">
        <Link href="/" className="font-mono text-[13px] font-semibold tracking-[0.18em]">
          CIRCUIT
        </Link>
        <span className="font-mono text-[11px] tracking-[0.1em] text-dim">/p/{view.slug}</span>
        <Link href="/build" className="ml-auto rounded-md border border-line-2 px-3 py-1 font-mono text-[11.5px] text-fg-2 hover:text-fg">
          Make your own
        </Link>
      </nav>

      <main className="mx-auto flex max-w-[1180px] flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-semibold tracking-[-0.01em] sm:text-[34px]">{view.name}</h1>
            {view.live ? (
              <span className="flex items-center gap-1.5 rounded-full border border-ok/40 bg-ok/10 px-2.5 py-0.5 font-mono text-[11px] tracking-[0.12em] text-ok">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" />
                LIVE
              </span>
            ) : (
              <span className="rounded-full border border-line-2 px-2.5 py-0.5 font-mono text-[11px] tracking-[0.12em] text-dim">PAUSED</span>
            )}
            {stale && <span className="font-mono text-[11px] text-[oklch(0.88_0.13_80)]">reconnecting…</span>}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px] text-fg-2">
            {view.token && (
              <a href={solscanAccount(view.token)} target="_blank" rel="noreferrer" className="hover:text-fg">
                token {short(view.token)} ↗
              </a>
            )}
            <a href={solscanAccount(view.owner)} target="_blank" rel="noreferrer" className="hover:text-fg">
              published by {short(view.owner)} ↗
            </a>
            <span className="text-dim">last event {ago(view.status.lastEventAt, now)}</span>
            <span className="text-dim">rules updated {ago(view.updatedAt, now)}</span>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="RUNS" value={view.world.executions.toLocaleString()} />
          <Stat label="AGENTS" value={view.world.agents.length.toLocaleString()} />
          <Stat label="VOLUME" value={`${m.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL`} />
          <Stat label="MARKET CAP" value={`$${Math.round(m.marketCap).toLocaleString()}`} />
          <Stat label="TRADES SEEN" value={m.trades.toLocaleString()} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <Card title="THE RULES" right={<span className="font-mono text-[10.5px] text-dim">exactly what the program does</span>}>
            {rules.length === 0 && <p className="text-[13.5px] text-dim">This program has no scripts yet.</p>}
            {rules.map((s, i) => (
              <section key={i} className="mb-5 last:mb-0">
                <h3 className="mb-1.5 text-[15px] font-medium leading-relaxed">
                  <Words parts={s.title} />
                </h3>
                {s.lines.map((l, j) => (
                  <p key={j} className="py-0.5 text-[14px] leading-relaxed text-fg-2" style={{ paddingLeft: 14 + l.depth * 18 }}>
                    <Words parts={l.parts} />
                  </p>
                ))}
              </section>
            ))}
          </Card>
          <Card title="PROOF OF EVERY RUN">
            <RunsPanel state={state} />
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card title="FEED">
            <FeedPanel state={state} />
          </Card>
          <Card title="AGENTS">
            <AgentsPanel state={state} />
          </Card>
          <Card title="WORLD">
            <WorldPanel state={state} />
          </Card>
        </div>

        <footer className="border-t border-line pt-4 text-[12.5px] leading-relaxed text-dim">
          Receipts marked LIVE · SOLANA were triggered by a real transaction: follow the Solscan link to check it. Timer runs use the server&apos;s clock ({view.timezone}).
          Treasury and trading inside programs are simulated: CIRCUIT never moves anyone&apos;s money.
        </footer>
      </main>
    </div>
  );
}
