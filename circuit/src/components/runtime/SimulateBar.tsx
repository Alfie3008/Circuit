"use client";

import { useState } from "react";
import { solscanAccount } from "@/lib/chain/parse";
import { PRESETS, programTriggers } from "@/lib/runtime/events";
import { useLiveChain } from "@/store/liveChain";
import { useProjectStore } from "@/store/project";
import { useRuntimeStore } from "@/store/runtime";
import { clock } from "./format";

const chip =
  "h-[26px] rounded-md border border-line-2 bg-canvas px-2 font-mono text-[11px] tracking-[0.02em] text-fg-2 transition-colors hover:border-signal/50 hover:text-fg";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

function LivePanel() {
  const { status, mint, lastCheck, seen, holders, error, start, stop } = useLiveChain();
  const chain = useRuntimeStore((s) => s.chainStatus);
  const setup = useProjectStore((s) => s.setup);
  const openDialog = useProjectStore((s) => s.openDialog);
  const on = status !== "off";

  if (!on)
    return (
      <div className="flex flex-col gap-2 text-[12.5px] text-fg-2">
        <p className="leading-snug">
          Run this program on your token&apos;s real trades. Every receipt links to the transaction on Solscan.
        </p>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11.5px]">
          <button onClick={start} className="h-[26px] rounded-md bg-ok/90 px-2.5 font-medium text-[#0b0c0d] hover:bg-ok">
            Watch {setup.tokenAddress ? short(setup.tokenAddress) : "token"}
          </button>
          <button onClick={() => openDialog("setup")} className="text-dim underline-offset-2 hover:text-fg hover:underline">
            {setup.tokenAddress ? "change token" : "set token"}
          </button>
        </div>
        {!chain?.enabled && (
          <p className="text-[11.5px] leading-snug text-dim">
            Needs <code className="text-fg-2">HELIUS_API_KEY</code> (free at helius.dev) or <code className="text-fg-2">CIRCUIT_SOLANA_RPC_URL</code> in .env.local.
          </p>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-1.5 font-mono text-[11.5px]">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status === "error" ? "bg-err" : status === "watching" ? "animate-pulse bg-ok" : "bg-signal"}`} />
        <span className={status === "error" ? "text-err" : "text-ok"}>{status === "starting" ? "CONNECTING" : status === "error" ? "PROBLEM" : "WATCHING"}</span>
        {mint && (
          <a href={solscanAccount(mint)} target="_blank" rel="noreferrer" className="text-fg-2 hover:text-fg" title="Open the token on Solscan">
            {short(mint)} ↗
          </a>
        )}
        <button onClick={stop} className="ml-auto text-dim hover:text-err">
          stop
        </button>
      </div>
      <p className="text-dim">
        {seen} {seen === 1 ? "trade" : "trades"} seen{holders !== null ? ` · ${holders.toLocaleString()} holders` : ""}
        {lastCheck ? ` · checked ${clock(lastCheck)}` : ""}
      </p>
      {error && <p className="leading-snug text-err">{error}</p>}
    </div>
  );
}

/**
 * Where events come from: the simulator (buttons, autoplay) or the project's
 * real token (LIVE TOKEN). Both produce the same normalized events.
 */
export function SimulateBar() {
  const program = useProjectStore((s) => s.program);
  const firePreset = useRuntimeStore((s) => s.firePreset);
  const fireEvent = useRuntimeStore((s) => s.fireEvent);
  const liveSim = useRuntimeStore((s) => s.liveSim);
  const setLiveSim = useRuntimeStore((s) => s.setLiveSim);
  const watching = useLiveChain((s) => s.status !== "off");
  const [mode, setMode] = useState<"sim" | "live">(watching ? "live" : "sim");
  const custom = program ? programTriggers(program) : [];

  const tab = (m: typeof mode, label: string) => (
    <button
      role="tab"
      aria-selected={mode === m}
      onClick={() => setMode(m)}
      className={`flex items-center gap-1.5 transition-colors ${mode === m ? "text-fg" : "text-dim hover:text-fg-2"}`}
    >
      {m === "live" && <span className={`h-1.5 w-1.5 rounded-full ${watching ? "animate-pulse bg-ok" : "bg-[#3a3d43]"}`} />}
      {label}
    </button>
  );

  return (
    <section className="border-b border-line px-3 pb-3 pt-2.5" aria-label="Event source">
      <div className="mb-2 flex items-center gap-4 font-mono text-[11px] tracking-[0.12em]" role="tablist">
        {tab("sim", "SIMULATOR")}
        {tab("live", "LIVE TOKEN")}
        {mode === "sim" && (
          <button
            onClick={() => setLiveSim(!liveSim)}
            aria-pressed={liveSim}
            title="Simulated market that trades by itself every few seconds, plus real timers for “every X minutes” and “at time” scripts. Runs while this tab is open."
            className={`ml-auto flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors ${liveSim ? "bg-signal/10 text-[oklch(0.88_0.13_80)]" : "text-dim hover:text-fg-2"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${liveSim ? "animate-pulse bg-signal" : "bg-[#3a3d43]"}`} />
            AUTOPLAY
          </button>
        )}
      </div>
      {mode === "sim" ? (
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
      ) : (
        <LivePanel />
      )}
    </section>
  );
}
