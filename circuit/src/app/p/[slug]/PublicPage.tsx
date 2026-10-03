"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { alpha, ERR, OK, SIG, VAL } from "@/components/proof/tokens";
import { artFor, clock } from "@/components/runtime/format";
import { RealReceipt } from "@/components/runtime/RealReceipt";
import { Words } from "@/components/runtime/Words";
import { LogoMark } from "@/components/site/Logo";
import { solscanAccount } from "@/lib/chain/parse";
import { explainProgram } from "@/lib/explain/explain";
import { countBlocks } from "@/lib/marketing/demos";
import type { Receipt } from "@/lib/runtime/state";
import type { Value } from "@/lib/runtime/values";
import type { PublicProject } from "@/lib/server/publicView";

const POLL_MS = 10_000;
const short = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
const mono = "font-mono";
const valuePill = "rounded-[4px] border border-[oklch(0.42_0.05_235)] bg-[oklch(0.29_0.035_235)] px-1.5 py-px font-mono text-[10.5px] text-[oklch(0.88_0.06_235)]";

type Layout = "world" | "gallery" | "feed" | "website";

function ago(t: number | null, now: number | null) {
  if (now === null) return "—";
  if (!t) return "never";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86_400)}d ago`;
}

const date = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const text = (v: Value | undefined) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** SHA-256 of the program, first 8 hex characters: the rules' fingerprint, worked out in the browser. */
function useFingerprint(program: unknown) {
  const [fp, setFp] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const bytes = new TextEncoder().encode(JSON.stringify(program));
    void crypto.subtle?.digest("SHA-256", bytes).then((d) => {
      if (alive) setFp([...new Uint8Array(d)].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join(""));
    });
    return () => {
      alive = false;
    };
  }, [program]);
  return fp;
}

/** What the page says about itself, honestly. */
function pageState(v: PublicProject) {
  const last = v.receipts[0];
  if (!v.live) return v.token ? { key: "paused", label: "PAUSED", color: "#a3a5ab" } : { key: "sim", label: "NOT RUNNING", color: SIG };
  if (last && (last.status === "error" || last.status === "step_limit")) return { key: "error", label: "LIVE · LAST RUN FAILED", color: ERR };
  if (v.world.executions === 0) return { key: "new", label: v.token ? "LIVE · NO TRADES YET" : "LIVE · WAITING", color: OK };
  return { key: "live", label: "LIVE", color: OK };
}

function sourceOf(r: Receipt) {
  if (r.event.proof) return { label: "LIVE", color: OK };
  if (r.event.source === "schedule") return { label: "CLOCK", color: VAL };
  if (r.event.source === "runtime") return { label: "PROGRAM", color: VAL };
  return { label: "SIM", color: SIG };
}

function effectOf(r: Receipt) {
  if (r.status === "error" || r.status === "step_limit") return { text: r.error ?? "The run failed.", color: ERR };
  const steps = r.entries.slice(1).filter((e) => e.status !== "skipped");
  if (!steps.length) return { text: "Counted. Nothing else to do.", color: "#8b8d93" };
  const main = steps.find((e) => /created|posted|purchase|reward|bounty/i.test(e.text)) ?? steps[steps.length - 1];
  return { text: main.text + (steps.length > 1 ? ` · +${steps.length - 1} more` : ""), color: "#e8e6e1" };
}

function Card({ n, title, right, children, flush }: { n: string; title: string; right?: React.ReactNode; children: React.ReactNode; flush?: boolean }) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#1f2125] bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1f2125] px-5 py-3.5">
        <span className={`${mono} text-[10.5px] tracking-[0.12em] text-dim`}>
          <span className="text-signal">{n}</span> · {title}
        </span>
        {right}
      </div>
      <div className={flush ? "" : "flex flex-1 flex-col gap-3.5 px-5 py-[18px]"}>{children}</div>
    </section>
  );
}

export function PublicPage({ initial }: { initial: PublicProject }) {
  const [view, setView] = useState(initial);
  // Times are drawn only in the browser (its clock and time zone), never on the server.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(first);
  }, []);
  const at = (t: number, len = 8) => (now === null ? "" : clock(t).slice(0, len));
  const [stale, setStale] = useState(false);
  const [layout, setLayout] = useState<Layout>("world");
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<Receipt | null>(null);

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const rules = useMemo(() => explainProgram(view.program), [view.program]);
  const blocks = useMemo(() => countBlocks(view.program), [view.program]);
  const fingerprint = useFingerprint(view.program);
  const st = pageState(view);
  const m = view.world.market;
  const agents = [...view.world.agents].reverse();
  const feed = [...view.world.feed].reverse();
  const site = Object.entries(view.world.website);
  const lastError = view.receipts.find((r) => r.status === "error" || r.status === "step_limit");
  const heroArt = agents[0] ? artFor(agents[0].species) : "  (o>\n  //\\\n  V_/_";

  const banner =
    st.key === "new"
      ? {
          tag: "NEW",
          color: OK,
          title: view.token ? "This coin is live and listening." : "This program is live and waiting.",
          text: view.token
            ? "No trades yet. When the first trades arrive, what the program does about them shows up here within seconds."
            : "Nothing has triggered it yet. Every run will appear in the activity list with its receipt.",
          cta: view.token ? { label: "Buy on pump.fun ↗", href: `https://pump.fun/coin/${view.token}` } : null,
        }
      : st.key === "sim"
        ? {
            tag: "NOT RUNNING",
            color: SIG,
            title: "This program isn't running on the server.",
            text: "Its creator published the rules but hasn't switched it on, so nothing here reacts to real events yet.",
            cta: { label: "Open the blocks", href: `/build?remix=${view.slug}` },
          }
        : st.key === "error" && lastError
          ? {
              tag: "ERROR",
              color: ERR,
              title: "The last run failed.",
              text: `${lastError.error ?? "A step failed."} The program keeps listening; the next event runs it again.`,
              cta: null,
              receipt: lastError,
            }
          : null;

  const stats: { k: string; v: string; color?: string }[] = [
    { k: "RUNS", v: view.world.executions.toLocaleString() },
    { k: "AGENTS", v: view.world.agents.length.toLocaleString() },
    { k: "VOLUME SEEN", v: `${m.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL` },
    { k: "LAST EVENT", v: ago(view.status.lastEventAt, now), color: view.status.lastEventAt ? undefined : "#6d7076" },
  ];

  return (
    <div className="min-h-screen min-w-0 bg-ink font-sans text-fg">
      <div className="flex h-[52px] items-center gap-3.5 border-b border-[#1d1f23] px-5">
        <Link href="/" className="flex items-center gap-3.5 text-fg hover:text-fg">
          <LogoMark size={16} />
          <span className={`${mono} text-[12px] tracking-[0.16em]`}>CIRCUIT</span>
        </Link>
        <span className={`${mono} truncate text-[11.5px] text-faint`}>/p/{view.slug}</span>
        <span className="flex-1" />
        {stale && <span className={`${mono} text-[11px] text-[oklch(0.88_0.13_80)]`}>reconnecting…</span>}
        <Link href="/build" className={`${mono} whitespace-nowrap text-[11.5px] text-fg-2 hover:text-signal`}>
          Build your own →
        </Link>
      </div>

      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-5 pb-10 pt-6">
        {/* Identity and stats */}
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="flex min-w-0 flex-[1_1_320px] items-center gap-4">
            <div
              className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-[14px] border border-signal/50 shadow-[0_0_24px_-6px_oklch(0.84_0.15_80_/_.45)]"
              style={{ background: "radial-gradient(circle at 50% 35%,#22252a,#111214)" }}
            >
              <pre className={`m-0 ${mono} text-[10px] leading-[1.1] text-[oklch(0.88_0.12_80)]`}>{heroArt}</pre>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <h1 className="m-0 text-[30px] font-semibold leading-none tracking-[-0.03em]">{view.name}</h1>
                {view.symbol && <span className={`${mono} text-[13px] text-fg-2`}>${view.symbol}</span>}
              </div>
              <div className={`flex flex-wrap items-center gap-2 ${mono} text-[11px]`}>
                <span
                  className="inline-flex h-[22px] items-center gap-[7px] whitespace-nowrap rounded-full border px-[9px] tracking-[0.1em]"
                  style={{ borderColor: alpha(st.color.startsWith("#") ? "oklch(0.7 0 0)" : st.color, 0.4), background: st.color.startsWith("#") ? "transparent" : alpha(st.color, 0.08), color: st.color }}
                >
                  <span className={`h-1.5 w-1.5 rounded-[3px] ${st.key === "live" || st.key === "new" ? "animate-pulse" : ""}`} style={{ background: st.color }} />
                  {st.label}
                </span>
                {view.token && (
                  <>
                    <button
                      onClick={() => {
                        void navigator.clipboard?.writeText(view.token!);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1400);
                      }}
                      className={`inline-flex h-[22px] cursor-pointer items-center gap-1.5 rounded-[5px] border border-[#2a2c31] bg-panel px-2 ${mono} text-[11px] text-fg-2 hover:border-[#3a3d43] hover:text-fg`}
                    >
                      {short(view.token)} <span className="text-dim">{copied ? "copied" : "copy"}</span>
                    </button>
                    <a href={solscanAccount(view.token)} target="_blank" rel="noreferrer" className="text-fg-2 hover:text-signal">
                      Solscan ↗
                    </a>
                    <a href={`https://pump.fun/coin/${view.token}`} target="_blank" rel="noreferrer" className="text-fg-2 hover:text-signal">
                      pump.fun ↗
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="grid max-w-[640px] flex-[1_1_360px] grid-cols-[repeat(auto-fit,minmax(130px,1fr))] overflow-hidden rounded-[10px] border border-[#1f2125] bg-panel">
            {stats.map((s) => (
              <div key={s.k} className="-mb-px -mr-px border-b border-r border-[#1f2125] px-3 py-2.5">
                <div className={`${mono} text-[10px] tracking-[0.12em] text-dim`}>{s.k}</div>
                <div className="mt-[3px] text-[21px] font-medium tracking-[-0.03em]" style={{ color: s.color ?? "#e8e6e1" }}>
                  {s.v}
                </div>
              </div>
            ))}
          </div>
        </div>

        {banner && (
          <div className="flex flex-wrap items-start gap-3.5 rounded-[10px] border px-4 py-3.5" style={{ borderColor: alpha(banner.color, 0.4), background: alpha(banner.color, 0.06) }}>
            <span className={`${mono} whitespace-nowrap pt-[3px] text-[10.5px] tracking-[0.12em]`} style={{ color: banner.color }}>
              {banner.tag}
            </span>
            <div className="min-w-0 flex-[1_1_260px]">
              <div className="text-[15px] font-medium">{banner.title}</div>
              <div className="mt-[3px] text-[13.5px] leading-normal text-fg-2 text-pretty">{banner.text}</div>
            </div>
            {banner.cta && (
              <a
                href={banner.cta.href}
                target={banner.cta.href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className={`inline-flex h-8 items-center whitespace-nowrap rounded-[7px] border px-3 ${mono} text-[11.5px] hover:bg-white/[0.03]`}
                style={{ borderColor: alpha(banner.color, 0.4), color: banner.color }}
              >
                {banner.cta.label}
              </a>
            )}
            {"receipt" in banner && banner.receipt && (
              <button
                onClick={() => setOpen(banner.receipt!)}
                className={`h-8 cursor-pointer whitespace-nowrap rounded-[7px] border bg-transparent px-3 ${mono} text-[11.5px] hover:bg-white/[0.03]`}
                style={{ borderColor: alpha(banner.color, 0.4), color: banner.color }}
              >
                See the receipt
              </button>
            )}
          </div>
        )}

        {/* How it works + rules */}
        <div className="flex flex-wrap items-stretch gap-4">
          <div className="flex min-w-0 flex-[2_1_520px]">
            <div className="flex w-full flex-col">
              <Card n="01" title="HOW THIS COIN WORKS" right={<span className={`${mono} text-[10.5px] tracking-[0.12em] text-dim`}>{blocks} BLOCKS</span>}>
                {rules.length === 0 && <p className="m-0 text-[15px] text-fg-2">This program has no rules yet.</p>}
                {rules.map((s, i) => (
                  <div key={i}>
                    <p className="m-0 text-[clamp(17px,2vw,21px)] font-medium leading-[1.55] tracking-[-0.01em]">
                      <Words parts={s.title} />
                    </p>
                    {s.lines.map((l, j) => (
                      <p key={j} className="m-0 text-[clamp(15px,1.6vw,18px)] leading-[1.6] text-fg-2 text-pretty" style={{ paddingLeft: 14 + l.depth * 18 }}>
                        <Words parts={l.parts} />
                      </p>
                    ))}
                  </div>
                ))}
                <div className={`mt-auto flex flex-wrap items-center gap-4 border-t border-dashed border-[#23252a] pt-3 ${mono} text-[11.5px] text-dim`}>
                  <span>Written from the blocks, not by the creator.</span>
                  <span className="flex-1" />
                  <Link href={`/build?remix=${view.slug}`} className="text-fg hover:text-signal">
                    Show the blocks →
                  </Link>
                </div>
              </Card>
            </div>
          </div>
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
            <Card n="02" title="RULES" right={<span className={`${mono} text-[10.5px] tracking-[0.12em] text-dim`}>PUBLISHED</span>}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] border border-dashed border-[#4a4d53] text-[14px] text-dim">○</span>
                <div>
                  <div className="text-[15px] font-medium">Published · not yet on Solana</div>
                  <div className="mt-0.5 text-[13px] text-fg-2 text-pretty">The rules above are exactly what runs. Writing their fingerprint to Solana is coming with verified rules.</div>
                </div>
              </div>
              <div className={`flex flex-col ${mono} text-[11.5px]`}>
                <div className="flex justify-between gap-2.5 border-t border-[#1d1f23] py-2">
                  <span className="text-dim">Fingerprint</span>
                  <span title="SHA-256 of the program, worked out in your browser">{fingerprint ?? "…"}</span>
                </div>
                <div className="flex justify-between gap-2.5 border-t border-[#1d1f23] py-2">
                  <span className="text-dim">Last published</span>
                  <span>{date(view.updatedAt)}</span>
                </div>
                <div className="flex justify-between gap-2.5 border-t border-[#1d1f23] py-2">
                  <span className="text-dim">Publisher</span>
                  <a href={solscanAccount(view.owner)} target="_blank" rel="noreferrer" className="text-fg hover:text-signal">
                    {short(view.owner)} ↗
                  </a>
                </div>
                <div className="flex justify-between gap-2.5 border-t border-[#1d1f23] py-2">
                  <span className="text-dim">Timers use</span>
                  <span>{view.timezone}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* World + activity */}
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-[2_1_520px]">
            <Card
              n="03"
              title={{ world: "THE WORLD", gallery: "GALLERY", feed: "FEED", website: "WEBSITE" }[layout]}
              flush
              right={
                <div className="flex gap-0.5 rounded-[7px] border border-[#23252a] bg-canvas p-0.5">
                  {(["world", "gallery", "feed", "website"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setLayout(k)}
                      className={`h-6 cursor-pointer rounded-[5px] px-[9px] ${mono} text-[10.5px] capitalize tracking-[0.08em]`}
                      style={{ background: k === layout ? "#22252a" : "transparent", color: k === layout ? "#e8e6e1" : "#6d7076" }}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              }
            >
              {(layout === "world" || layout === "gallery") && agents.length === 0 && (
                <Empty text={view.token ? "Characters and objects the program creates appear here within seconds." : "Characters and objects the program creates appear here."} />
              )}
              {layout === "world" && agents.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5 p-4">
                  {agents.map((g) => (
                    <div key={g.id} className="flex flex-col gap-2.5 rounded-[10px] border border-[#23252a] bg-canvas p-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-lg border border-[#23252a] bg-raised">
                          <pre className={`m-0 ${mono} text-[9.5px] leading-[1.1] text-[oklch(0.86_0.1_80)]`}>{artFor(g.species)}</pre>
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-medium">{g.name}</div>
                          <div className="mt-0.5 line-clamp-2 text-[12px] text-fg-2">
                            {g.species}
                            {g.personality ? ` · ${g.personality}` : ""}
                          </div>
                        </div>
                      </div>
                      <div className={`flex items-center justify-between ${mono} text-[10.5px] text-dim`}>
                        {g.custom.holdings !== undefined ? <span className={valuePill}>{text(g.custom.holdings)}</span> : <span>{g.goal ? short(g.goal) : ""}</span>}
                        <span>born {at(g.createdAt, 5)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {layout === "gallery" && agents.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5 p-4">
                  {agents.map((g, i) => (
                    <div key={g.id} className="flex flex-col gap-1.5">
                      <div className="flex aspect-square items-center justify-center rounded-[10px] border border-[#23252a]" style={{ background: "radial-gradient(circle at 50% 40%,#1c1e22,#0e0f11)" }}>
                        <pre className={`m-0 ${mono} text-[16px] leading-[1.1] text-[oklch(0.88_0.12_80)]`}>{artFor(g.species)}</pre>
                      </div>
                      <div className={`flex justify-between ${mono} text-[11px]`}>
                        <span className="truncate">{g.name}</span>
                        <span className="text-dim">#{String(agents.length - i).padStart(3, "0")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {layout === "feed" &&
                (feed.length === 0 ? (
                  <Empty text="Posts the program makes appear here." />
                ) : (
                  <div className="flex flex-col">
                    {feed.map((f, i) => (
                      <div key={i} className="flex gap-3 border-b border-[#1d1f23] px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] leading-normal text-[#d6d4cf] text-pretty">{f.text}</div>
                          <div className={`mt-1.5 ${mono} text-[10.5px] text-dim`}>
                            {at(f.at)} · run #{String(f.run).padStart(4, "0")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              {layout === "website" &&
                (site.length === 0 ? (
                  <Empty text="Values the program sets with “set website” appear here as a mini homepage." />
                ) : (
                  <div className="p-4">
                    <div className="overflow-hidden rounded-[10px] border border-[#23252a] bg-canvas">
                      <div className="border-b border-[#1d1f23] px-6 py-7" style={{ background: "radial-gradient(ellipse at 80% 0%,oklch(0.84 0.15 80 / .08),transparent 60%)" }}>
                        <div className={`${mono} text-[10.5px] uppercase tracking-[0.12em] text-dim`}>{view.slug}</div>
                        <div className="mt-2.5 text-[clamp(24px,3vw,34px)] font-semibold leading-[1.05] tracking-[-0.04em] text-balance">
                          {text(view.world.website.headline ?? view.name)}
                        </div>
                      </div>
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
                        {site
                          .filter(([k]) => k !== "headline")
                          .map(([k, v]) => (
                            <div key={k} className="-mb-px -mr-px border-b border-r border-[#1d1f23] px-4 py-3">
                              <div className={`${mono} text-[10.5px] text-var`}>{k}</div>
                              <div className="mt-1 text-[18px] font-medium">{text(v)}</div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                ))}
            </Card>
          </div>

          <div className="min-w-0 flex-[1_1_320px]">
            <Card
              n="04"
              title="ACTIVITY"
              flush
              right={
                <span className={`inline-flex items-center gap-1.5 ${mono} text-[10.5px] tracking-[0.12em]`} style={{ color: view.live ? OK : "#6d7076" }}>
                  <span className={`h-1.5 w-1.5 rounded-[3px] ${view.live ? "animate-pulse" : ""}`} style={{ background: view.live ? OK : "#6d7076" }} />
                  {view.live ? "LISTENING" : "OFF"}
                </span>
              }
            >
              {view.receipts.length === 0 ? (
                <div className="flex flex-col gap-2.5 px-5 py-7">
                  <div className="text-[15px]">{view.token ? "Waiting for the first trade." : "Waiting for the first event."}</div>
                  <div className="text-[13px] leading-normal text-fg-2 text-pretty">
                    {view.status.liveSince && now !== null ? `Listening since ${at(view.status.liveSince, 5)}. ` : ""}Every event will appear here with what the program did about it.
                  </div>
                  {view.token && (
                    <a
                      href={`https://pump.fun/coin/${view.token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-flex h-[34px] items-center self-start rounded-[7px] bg-signal px-3.5 text-[13px] font-medium text-signal-ink hover:text-signal-ink hover:brightness-[1.08]"
                    >
                      Make the first trade on pump.fun ↗
                    </a>
                  )}
                </div>
              ) : (
                <>
                  {view.receipts.map((r) => {
                    const src = sourceOf(r);
                    const fx = effectOf(r);
                    const d = r.event.data;
                    const who = typeof d.wallet === "string" && !d.wallet.startsWith("sim") ? short(d.wallet) : "";
                    return (
                      <button key={r.id} onClick={() => setOpen(r)} className="flex w-full cursor-pointer flex-col gap-[5px] border-b border-[#1d1f23] px-5 py-3 text-left hover:bg-[#15161a]">
                        <div className={`flex w-full min-w-0 items-center gap-2 ${mono} text-[11px]`}>
                          <span className="rounded-[3px] border px-[5px] text-[9.5px] tracking-[0.1em]" style={{ borderColor: alpha(src.color, 0.45), color: src.color }}>
                            {src.label}
                          </span>
                          <span className="truncate text-fg">{r.event.label}</span>
                          <span className="truncate text-faint">{who}</span>
                          <span className="flex-1" />
                          <span className="shrink-0 text-faint">{at(r.startedAt)}</span>
                        </div>
                        <div className="flex w-full items-baseline gap-2 text-[13.5px] leading-[1.4]">
                          <span className={`${mono} text-faint`}>→</span>
                          <span className="flex-1 text-pretty" style={{ color: fx.color }}>
                            {fx.text}
                          </span>
                          <span className={`${mono} text-[11px] text-faint`}>›</span>
                        </div>
                      </button>
                    );
                  })}
                  <div className={`flex justify-between px-5 py-2.5 ${mono} text-[11px] text-dim`}>
                    <span>Tap a row for its receipt</span>
                    <span>{view.world.executions.toLocaleString()} runs in total</span>
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>
      </div>

      <div className={`flex flex-wrap justify-between gap-3 border-t border-[#1d1f23] px-5 py-4 ${mono} text-[10.5px] tracking-[0.1em] text-faint`}>
        <span>RUNS ON CIRCUIT · MAKE YOUR COIN DO SOMETHING</span>
        <span>FINANCE IS SIMULATED</span>
      </div>

      {open && (
        <div onClick={() => setOpen(null)} className="fixed inset-0 z-[300] flex items-center justify-center bg-[rgba(5,6,7,.74)] p-6 backdrop-blur-[6px]">
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-full w-[520px] max-w-full flex-col gap-2.5 overflow-auto">
            <div className={`flex justify-between ${mono} text-[11px] tracking-[0.12em] text-muted`}>
              <span>RECEIPT</span>
              <button onClick={() => setOpen(null)} className="cursor-pointer text-fg">
                CLOSE ✕
              </button>
            </div>
            <RealReceipt r={open} />
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="m-5 flex flex-col items-center gap-2 rounded-[10px] border border-dashed border-[#2a2c31] px-5 py-10 text-center">
      <pre className="m-0 font-mono text-[12px] leading-[1.15] text-[#3a3d43]">{"  ?  ?  ?"}</pre>
      <div className="text-[15px]">Nothing here yet.</div>
      <div className="max-w-[340px] text-[13px] text-fg-2 text-pretty">{text}</div>
    </div>
  );
}
