"use client";

import { useEffect, useMemo, useState } from "react";
import { useFingerprint } from "@/components/runtime/fingerprint";
import { Words } from "@/components/runtime/Words";
import { api, findWallet, shortWallet, writeRulesToSolana } from "@/lib/account/wallet";
import { isAddress, solscanAccount } from "@/lib/chain/parse";
import { explainProgram } from "@/lib/explain/explain";
import { AI_COST_PER_CALL_USD, DEFAULT_CREATOR_FEE_RATE, FUEL_SHARE } from "@/lib/fuel";
import { countBlocks } from "@/lib/marketing/demos";
import type { ProjectSetup } from "@/lib/project/storage";
import { useAccount } from "@/store/account";
import { useProjectStore } from "@/store/project";

const OK = "oklch(0.80 0.13 155)";
const SIG = "oklch(0.84 0.15 80)";
const STEPS = ["Connect the coin", "AI fuel", "Review", "Publish", "Page layout"];
const TITLES = ["Connect your coin", "Your coin pays for its AI", "Review the rules", "Publish your rules", "Choose your public page"];
const LAYOUTS: { id: ProjectSetup["pageLayout"]; name: string; desc: string; cols: string; cells: string[] }[] = [
  { id: "world", name: "World", desc: "Agents and entities as cards", cols: "1fr 1fr 1fr", cells: ["100%", "100%", "100%", "100%", "100%", "100%"] },
  { id: "gallery", name: "Gallery", desc: "Characters as collectible tiles", cols: "1fr 1fr 1fr 1fr", cells: ["100%", "100%", "100%", "100%"] },
  { id: "feed", name: "Feed", desc: "Posts your program makes", cols: "1fr", cells: ["12px", "12px", "12px"] },
  { id: "website", name: "Website", desc: "A mini homepage from your values", cols: "1fr 1fr", cells: ["24px", "24px", "14px", "14px"] },
];
/** A worked example for the AI fuel step: fees on $10k of trading. */
const EXAMPLE_VOLUME_USD = 10_000;
const EXAMPLE_FEES_USD = EXAMPLE_VOLUME_USD * DEFAULT_CREATOR_FEE_RATE;
const EXAMPLE_CALLS = Math.round((EXAMPLE_FEES_USD * FUEL_SHARE) / AI_COST_PER_CALL_USD);
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const field =
  "h-[42px] w-full rounded-lg border border-[#2a2c31] bg-canvas px-3 font-mono text-[12.5px] text-fg placeholder:text-faint focus:border-signal/60 focus:outline-none";

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Go live: connect, AI fuel, review, publish, page layout. Every step uses the real thing. */
export function GoLiveDialog({ onClose }: { onClose: () => void }) {
  const { wallet, busy: signing, error: signError, signIn, refresh } = useAccount();
  const current = useProjectStore((s) => s.current);
  const program = useProjectStore((s) => s.program);
  const setup = useProjectStore((s) => s.setup);
  const updateSetup = useProjectStore((s) => s.updateSetup);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"coin" | "none">(setup.launchMode === "existing" || !!setup.tokenAddress ? "coin" : "none");
  const [ack, setAck] = useState(false);
  const [slug, setSlug] = useState(() => slugify(setup.tokenSymbol || current?.name || "my-coin"));
  const [pub, setPub] = useState<"idle" | "pending" | "done">("idle");
  const [pubError, setPubError] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [layout, setLayout] = useState<ProjectSetup["pageLayout"]>(setup.pageLayout ?? "world");
  const [creator, setCreator] = useState<{ key: string; state: "checking" | "ok" | "other" | "unknown" | "error"; detail?: string } | null>(null);
  const [onChain, setOnChain] = useState<{ state: "idle" | "wallet" | "confirming" | "done"; version?: number; signature?: string; error?: string }>({ state: "idle" });
  const rules = useMemo(() => (program ? explainProgram(program) : []), [program]);
  const fingerprint = useFingerprint(program);
  const mint = setup.tokenAddress;

  useEffect(() => {
    if (wallet === undefined) void refresh();
  }, [wallet, refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The creator check: only the wallet that created the coin can publish its page.
  const creatorKey = wallet && mode === "coin" && isAddress(mint) ? `${wallet}:${mint}` : null;
  useEffect(() => {
    if (!creatorKey || creator?.key === creatorKey) return;
    let alive = true;
    const [, coin] = creatorKey.split(":");
    void (async () => {
      setCreator({ key: creatorKey, state: "checking" });
      try {
        const r = await api<{ creator: string | null; checked: boolean; matches: boolean | null }>(`/api/proof/creator?mint=${coin}`);
        if (!alive) return;
        if (!r.checked || r.matches === null) setCreator({ key: creatorKey, state: "unknown", detail: r.checked ? "Couldn't find who created this coin, so the page will say the creator isn't verified." : "This server can't read Solana, so the creator can't be checked." });
        else setCreator({ key: creatorKey, state: r.matches ? "ok" : "other", detail: r.creator ?? undefined });
      } catch (e) {
        if (alive) setCreator({ key: creatorKey, state: "error", detail: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [creatorKey, creator?.key]);
  const creatorState = creatorKey && creator?.key === creatorKey ? creator.state : creatorKey ? "checking" : null;

  const coinOk = mode === "none" || (isAddress(mint) && creatorState !== "other" && creatorState !== "checking" && creatorState !== "error");
  const ok = [!!wallet && coinOk, true, ack, pub === "done", true];

  const writeOnChain = async () => {
    if (!current || !program || !publishedSlug) return;
    setOnChain({ state: "wallet" });
    try {
      const r = await writeRulesToSolana(current.id, publishedSlug, program, (stage) => setOnChain({ state: stage }));
      setOnChain({ state: "done", version: r.version, signature: r.signature });
    } catch (e) {
      setOnChain({ state: "idle", error: e instanceof Error ? e.message : String(e) });
    }
  };
  const reach = (i: number) => i <= step || ok.slice(0, i).every(Boolean);

  const publish = async () => {
    if (!program || !current) return;
    setPub("pending");
    setPubError(null);
    try {
      const body = { id: current.id, name: current.name, slug, program, setup: { ...setup, pageLayout: layout }, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      await api("/api/projects", { method: "POST", body });
      await api(`/api/projects/${current.id}`, { method: "PATCH", body: { live: true } });
      setPublishedSlug(slug);
      setPub("done");
    } catch (e) {
      setPubError(e instanceof Error ? e.message : String(e));
      setPub("idle");
    }
  };

  const pickLayout = (l: ProjectSetup["pageLayout"]) => {
    setLayout(l);
    updateSetup({ pageLayout: l });
    if (current && pub === "done") void api(`/api/projects/${current.id}`, { method: "PATCH", body: { layout: l } }).catch(() => {});
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-[200] flex items-center justify-center bg-[rgba(5,6,7,.74)] p-6 backdrop-blur-[6px]">
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Go live"
        className="flex max-h-full min-h-[560px] w-[960px] max-w-full overflow-hidden rounded-2xl border border-[#2a2c31] bg-panel font-sans text-fg shadow-[0_40px_90px_-30px_#000]"
      >
        <div className="hidden w-60 shrink-0 flex-col gap-1 border-r border-[#1f2125] bg-canvas px-4 py-5 md:flex">
          <div className="mb-3.5 truncate font-mono text-[10.5px] uppercase tracking-[0.14em] text-ok">GO LIVE · {current?.name}</div>
          {STEPS.map((label, i) => {
            const d = i < step;
            const a = i === step;
            return (
              <button
                key={label}
                onClick={() => reach(i) && setStep(i)}
                className="flex items-center gap-2.5 rounded-[7px] px-2 py-[9px] text-left"
                style={{ background: a ? "#18191c" : "transparent", cursor: reach(i) ? "pointer" : "default" }}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[10px] border font-mono text-[10px]"
                  style={{ borderColor: d ? OK : a ? SIG : "#34363c", color: d ? OK : a ? SIG : "#6d7076" }}
                >
                  {d ? "✓" : i + 1}
                </span>
                <span className="text-[13.5px]" style={{ color: a ? "#e8e6e1" : d ? "#a3a5ab" : "#6d7076" }}>
                  {label}
                </span>
              </button>
            );
          })}
          <div className="mt-auto text-[12px] leading-normal text-dim text-pretty">Trades and purchases a program makes are simulated at launch.</div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-6 pt-[18px] font-mono text-[11px] tracking-[0.12em] text-dim">
            <span>STEP {step + 1} OF 5</span>
            <button onClick={onClose} className="cursor-pointer text-fg-2 hover:text-fg" aria-label="Close">
              ✕
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-4 overflow-auto px-6 pb-5 pt-3">
            <h3 className="m-0 text-[26px] font-medium tracking-[-0.03em]">{TITLES[step]}</h3>

            {step === 0 && (
              <>
                <div className="text-[14.5px] leading-normal text-fg-2 text-pretty">
                  Paste your coin&apos;s mint address, then sign in with your wallet. Signing is free and moves no SOL.
                </div>
                <div className="flex gap-0.5 self-start rounded-lg border border-[#23252a] bg-canvas p-[3px]">
                  {(
                    [
                      ["coin", "I have a coin"],
                      ["none", "No coin yet"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => {
                        setMode(k);
                        updateSetup({ launchMode: k === "coin" ? "existing" : "prototype" });
                      }}
                      className="h-7 cursor-pointer rounded-md px-3 font-mono text-[11.5px]"
                      style={{ background: k === mode ? "#22252a" : "transparent", color: k === mode ? "#e8e6e1" : "#6d7076" }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {mode === "coin" ? (
                  <>
                    <label className="flex items-center gap-2.5">
                      <span className="w-12 shrink-0 font-mono text-[11px] text-dim">MINT</span>
                      <input className={field} value={mint} placeholder="Your coin's mint address" onChange={(e) => updateSetup({ tokenAddress: e.target.value.trim(), launchMode: "existing" })} />
                    </label>
                    {mint && !isAddress(mint) && <p className="m-0 text-[12.5px] text-err">That isn&apos;t a Solana address.</p>}
                    {isAddress(mint) && (
                      <div className="flex items-center gap-3 rounded-[10px] border border-[#23252a] bg-canvas p-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-signal/50 font-mono text-[8px] text-[oklch(0.88_0.12_80)]">{"(o>"}</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14.5px]">
                            {current?.name} {setup.tokenSymbol && <span className="font-mono text-[12px] text-dim">${setup.tokenSymbol}</span>}
                          </div>
                          <div className="truncate font-mono text-[11px] text-dim">{shortWallet(mint)} · trades are read from Solana, read-only</div>
                        </div>
                        <a href={solscanAccount(mint)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-fg-2 hover:text-signal">
                          Solscan ↗
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-[10px] border border-[#23252a] bg-canvas p-3 text-[13.5px] leading-normal text-fg-2">
                    Without a coin, the program still runs on the server: timers fire on the server&apos;s clock and the public page shows every run. Connect a coin
                    later from Project setup.
                  </div>
                )}
                {wallet ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2.5 rounded-lg border border-ok/45 bg-ok/[0.07] p-3 text-[14px]">
                      <span className="text-ok">✓</span>Signed in as {shortWallet(wallet)}.
                    </div>
                    {mode === "coin" && creatorState === "checking" && <p className="m-0 text-[13px] text-dim">Checking on Solana that this wallet created the coin…</p>}
                    {mode === "coin" && creatorState === "ok" && (
                      <p className="m-0 text-[13px] text-ok">✓ This wallet created the coin. Its page will say so.</p>
                    )}
                    {mode === "coin" && creatorState === "other" && (
                      <p className="m-0 rounded-lg border border-err/50 bg-err/[0.06] p-3 text-[13px] leading-normal text-fg">
                        This coin was created by {creator?.detail ? shortWallet(creator.detail) : "another wallet"}, not {shortWallet(wallet)}. Only the creator can publish its page: sign in with
                        that wallet.
                      </p>
                    )}
                    {mode === "coin" && creatorState === "unknown" && <p className="m-0 text-[13px] text-dim">{creator?.detail}</p>}
                    {mode === "coin" && creatorState === "error" && (
                      <p className="m-0 text-[13px] text-err">
                        {creator?.detail}{" "}
                        <button onClick={() => setCreator(null)} className="cursor-pointer underline">
                          Try again
                        </button>
                      </p>
                    )}
                  </div>
                ) : findWallet() ? (
                  <button
                    onClick={() => void signIn()}
                    disabled={signing}
                    className="flex h-10 cursor-pointer items-center gap-2.5 self-start rounded-lg border border-[#34363c] bg-[#18191c] px-4 text-[14px] text-fg disabled:opacity-60"
                  >
                    {signing ? "Waiting for wallet…" : `Sign in with ${findWallet()!.name}`}
                  </button>
                ) : (
                  <p className="m-0 rounded-lg border border-line-2 bg-canvas p-3 text-[13px] text-fg-2">
                    No Solana wallet found in this browser.{" "}
                    <a href="https://phantom.com/download" target="_blank" rel="noreferrer" className="text-[oklch(0.88_0.13_80)] hover:underline">
                      Install Phantom ↗
                    </a>{" "}
                    and reload.
                  </p>
                )}
                {signError && <p className="m-0 text-[12.5px] text-err">{signError}</p>}
              </>
            )}

            {step === 1 && (
              <>
                <div className="text-[14.5px] leading-normal text-fg-2 text-pretty">
                  AI blocks (names, personalities, posts, decisions) cost a fraction of a cent each time they run. You don&apos;t set a budget: your coin pays for its
                  own AI out of the creator fees it earns.
                </div>
                <div className="grid grid-cols-3 overflow-hidden rounded-[10px] border border-[#23252a] font-mono">
                  <div className="border-r border-[#23252a] p-3">
                    <div className="text-[10px] tracking-[0.12em] text-dim">AI MAY SPEND</div>
                    <div className="mt-1 text-[17px]">up to {pct(FUEL_SHARE)}</div>
                    <div className="mt-0.5 text-[11px] text-dim">of fees earned after going live</div>
                  </div>
                  <div className="border-r border-[#23252a] p-3">
                    <div className="text-[10px] tracking-[0.12em] text-dim">EXAMPLE</div>
                    <div className="mt-1 text-[17px]">${EXAMPLE_VOLUME_USD.toLocaleString()} traded</div>
                    <div className="mt-0.5 text-[11px] text-dim">≈ ${EXAMPLE_FEES_USD.toFixed(0)} in creator fees</div>
                  </div>
                  <div className="p-3">
                    <div className="text-[10px] tracking-[0.12em] text-dim">PAYS FOR</div>
                    <div className="mt-1 text-[17px]">≈ {EXAMPLE_CALLS.toLocaleString()}</div>
                    <div className="mt-0.5 text-[11px] text-dim">AI calls</div>
                  </div>
                </div>
                <div className="text-[13.5px] leading-normal text-fg-2 text-pretty">
                  {mode === "coin"
                    ? "If the fuel ever runs out, AI blocks answer with simple fallbacks (default names, template posts) until the next trades refill it. Nothing else stops."
                    : "With no coin connected there are no creator fees, so AI blocks answer with simple fallbacks (default names, template posts). Connect a coin to give it real AI."}
                </div>
                <div className="rounded-lg border border-signal/40 bg-signal/[0.06] px-3.5 py-3 text-[13.5px] leading-normal text-fg">
                  Creator-fee routing depends on the token&apos;s existing configuration and is not automatically changed by Circuit.
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="font-mono text-[10.5px] tracking-[0.12em] text-dim">THE RULES HOLDERS WILL READ</div>
                <div className="rounded-[10px] border border-[#23252a] bg-canvas p-4">
                  {!program && <p className="m-0 text-err">The program has an error, so it can&apos;t go live yet.</p>}
                  {rules.map((s, i) => (
                    <div key={i}>
                      <p className="m-0 text-[17px] font-medium leading-[1.55]">
                        <Words parts={s.title} />
                      </p>
                      {s.lines.map((l, j) => (
                        <p key={j} className="m-0 text-[15.5px] leading-[1.55] text-fg-2" style={{ paddingLeft: 14 + l.depth * 16 }}>
                          <Words parts={l.parts} />
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
                <button onClick={() => setAck((a) => !a)} className="flex cursor-pointer items-center gap-2.5 text-left text-[14px] text-fg-2">
                  <span
                    className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border text-[12px] text-signal-ink"
                    style={{ borderColor: ack ? SIG : "#4a4d53", background: ack ? SIG : "transparent" }}
                  >
                    {ack ? "✓" : ""}
                  </span>
                  I understand trades and purchases this program makes are simulated at launch.
                </button>
              </>
            )}

            {step === 3 && (
              <>
                <div className="text-[14.5px] leading-normal text-fg-2 text-pretty">
                  Publishing gives your coin a public page and starts the program on the server. The page shows the rules, the world and a receipt for every run. Editing
                  later publishes a new version.
                </div>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[10.5px] tracking-[0.12em] text-dim">PUBLIC PAGE</span>
                  <span className="flex items-center gap-2">
                    <span className="shrink-0 font-mono text-[12.5px] text-dim">{typeof location !== "undefined" ? location.host : ""}/p/</span>
                    <input className={field} value={slug} disabled={pub === "done"} onChange={(e) => setSlug(slugify(e.target.value))} maxLength={40} />
                  </span>
                </label>
                <div className="flex items-center gap-4 rounded-[10px] border border-[#23252a] bg-canvas p-4">
                  <div className="flex-1 font-mono">
                    <div className="text-[10px] tracking-[0.12em] text-dim">FINGERPRINT</div>
                    <div className="mt-1 text-[26px] tracking-[0.04em]">{fingerprint ?? "…"}</div>
                  </div>
                  <div className="text-right font-mono text-[11px] text-dim">
                    {program ? countBlocks(program) : 0} blocks
                    <br />
                    SHA-256 of the program
                  </div>
                </div>
                {pub === "idle" && (
                  <button
                    onClick={() => void publish()}
                    disabled={!program || slug.length < 3}
                    className="h-[42px] cursor-pointer self-start rounded-lg bg-ok px-[18px] text-[14px] font-medium text-[#0d1410] disabled:opacity-50"
                  >
                    Publish and go live
                  </button>
                )}
                {pub === "pending" && (
                  <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-signal/50 p-3 font-mono text-[12px] text-[oklch(0.88_0.12_80)]">
                    <span className="h-3 w-3 animate-spin rounded-md border-[1.5px] border-dashed border-signal [animation-duration:2s]" />
                    Publishing…
                  </div>
                )}
                {pub === "done" && (
                  <div className="flex flex-col gap-1.5 rounded-lg border border-ok/45 bg-ok/[0.07] px-3.5 py-3">
                    <div className="text-[14.5px]">
                      <span className="text-ok">✓</span> Published and running on the server.
                    </div>
                    <div className="font-mono text-[11.5px] text-fg-2">
                      /p/{publishedSlug} · fingerprint {fingerprint}
                    </div>
                  </div>
                )}
                {pub === "done" && (
                  <div className="flex flex-col gap-2 rounded-[10px] border border-[#23252a] bg-canvas p-4">
                    <div className="text-[14.5px] font-medium">Write the fingerprint to Solana</div>
                    <div className="text-[13px] leading-normal text-fg-2 text-pretty">
                      Holders can then check the rules on your page are exactly the ones you published, and that you can&apos;t change them quietly. Your wallet signs one
                      small transaction (network fee only, about 0.000005 SOL). You can also do this later from Publish.
                    </div>
                    {onChain.state === "done" ? (
                      <div className="text-[13.5px]">
                        <span className="text-ok">✓</span> On Solana as version {onChain.version} ·{" "}
                        <a href={`https://solscan.io/tx/${onChain.signature}`} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-fg-2 hover:text-signal">
                          Solscan ↗
                        </a>
                      </div>
                    ) : (
                      <button
                        onClick={() => void writeOnChain()}
                        disabled={onChain.state !== "idle"}
                        className="h-[38px] cursor-pointer self-start rounded-lg border border-ok/50 bg-ok/[0.08] px-4 text-[13.5px] text-[oklch(0.86_0.11_155)] hover:bg-ok/[0.16] disabled:opacity-60"
                      >
                        {onChain.state === "wallet" ? "Approve it in your wallet…" : onChain.state === "confirming" ? "Waiting for Solana to confirm…" : "Write to Solana"}
                      </button>
                    )}
                    {onChain.error && <p className="m-0 text-[12.5px] text-err">{onChain.error}</p>}
                  </div>
                )}
                {pubError && <p className="m-0 whitespace-pre-wrap text-[12.5px] text-err">{pubError}</p>}
              </>
            )}

            {step === 4 && (
              <>
                <div className="text-[14.5px] leading-normal text-fg-2">Pick how your public page shows what your program builds. You can change it any time.</div>
                <div className="grid grid-cols-2 gap-2.5">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => pickLayout(l.id)}
                      className="flex cursor-pointer flex-col gap-2.5 rounded-[10px] border p-3 text-left"
                      style={{ borderColor: l.id === layout ? "oklch(0.84 0.15 80 / .6)" : "#23252a", background: l.id === layout ? "oklch(0.84 0.15 80 / .05)" : "#0e0f11" }}
                    >
                      <div className="grid h-[70px] gap-1 rounded-md border border-[#23252a] bg-canvas p-2" style={{ gridTemplateColumns: l.cols }}>
                        {l.cells.map((h, i) => (
                          <span key={i} className="rounded-[3px] bg-[#22252a]" style={{ height: h }} />
                        ))}
                      </div>
                      <div>
                        <div className="text-[14px] font-medium">{l.name}</div>
                        <div className="mt-0.5 text-[12.5px] text-fg-2">{l.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="flex items-center justify-between gap-2.5 border-t border-[#1f2125] px-6 py-3.5">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="h-[38px] cursor-pointer rounded-lg border border-line-2 px-3.5 text-[14px]"
              style={{ color: step === 0 ? "#55585e" : "#e8e6e1" }}
            >
              Back
            </button>
            {step < 4 ? (
              <button
                onClick={() => ok[step] && setStep((s) => s + 1)}
                className="h-[38px] rounded-lg px-[18px] text-[14px] font-medium"
                style={{ background: ok[step] ? SIG : "#22252a", color: ok[step] ? "#15130f" : "#55585e", cursor: ok[step] ? "pointer" : "not-allowed" }}
              >
                Continue →
              </button>
            ) : (
              <a
                href={publishedSlug ? `/p/${publishedSlug}` : "#"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-[38px] items-center rounded-lg bg-signal px-[18px] text-[14px] font-medium text-signal-ink hover:text-signal-ink hover:brightness-[1.08]"
              >
                Open your page →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
