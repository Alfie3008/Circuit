"use client";

import { useEffect, useState } from "react";
import { alpha, ERR, OK, SIG, simChip, valuePill } from "./tokens";

export interface ReceiptStep {
  label: string;
  val?: string;
  tail?: string;
  sim?: boolean;
}

export interface ReceiptProps {
  size?: "full" | "card" | "row";
  source?: "live" | "sim";
  status?: "complete" | "error" | "stopped" | "limit" | "running";
  /** Forced to "na" unless the source is live. */
  proof?: "anchored" | "pending" | "na";
  /** Running: steps done so far (animates by itself when omitted). */
  progress?: number;
  steps?: ReceiptStep[];
  failAt?: number;
  reason?: string;
  exec?: string;
  time?: string;
  line?: string;
  amount?: string;
  wallet?: string;
  tx?: string;
  onVerify?: () => void;
  onOpen?: () => void;
  /** Real receipts: replace the sample header line, sub line and proof text. */
  trigger?: { verb: string; amount?: string; by?: string };
  sub?: React.ReactNode;
  naText?: string;
  /** Overrides the source chip (e.g. SCHEDULED, RAISED BY THE PROGRAM). */
  sourceLabel?: string;
  /** Status bar count text (e.g. "6 steps"). */
  countText?: string;
}

const DEFAULT_STEPS: ReceiptStep[] = [
  { label: "Volume reached", val: "100 SOL" },
  { label: "Agent", val: "Mochi", tail: "created" },
  { label: "Species", val: "penguin" },
  { label: "Asset selected", val: "META" },
  { label: "Purchase", val: "0.03 SOL", sim: true },
  { label: "World updated" },
];

type StepState = "done" | "fail" | "skip" | "limit" | "run" | "wait";
const MARK: Record<StepState, [string, string]> = {
  done: ["✓", OK],
  fail: ["✕", ERR],
  skip: ["–", "#55585e"],
  limit: ["!", SIG],
  run: ["●", SIG],
  wait: ["○", "#3a3d43"],
};

/** A run's receipt: what caused it, each step, the outcome, and its proof. (Design component.) */
export function Receipt(p: ReceiptProps) {
  const size = p.size ?? "full";
  const source = p.source ?? "live";
  const status = p.status ?? "complete";
  const proof = source === "live" && !p.naText ? (p.proof ?? "anchored") : "na";
  const steps = p.steps ?? DEFAULT_STEPS;
  const n = steps.length;
  const card = size === "card";

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (status !== "running" || p.progress != null) return;
    const id = setInterval(() => setTick((t) => (t + 1) % 9), 700);
    return () => clearInterval(id);
  }, [status, p.progress]);

  const prog = status === "running" ? Math.min(p.progress ?? tick, n) : 0;
  const failAt = status === "error" ? (p.failAt ?? 4) : status === "limit" ? n - 1 : status === "stopped" ? 3 : -1;
  const reasons = {
    error: p.reason ?? "The simulated treasury has 0.01 SOL and this purchase needs 0.03 SOL. Top up the treasury in the builder or lower the amount.",
    limit: "Step limit reached (50 steps). The world was not updated on this run.",
  };

  const all = steps.map((s, i) => {
    let st: StepState = "done";
    if (status === "error") st = i < failAt ? "done" : i === failAt ? "fail" : "skip";
    if (status === "stopped") st = i < failAt ? "done" : "skip";
    if (status === "limit") st = i < failAt ? "done" : "limit";
    if (status === "running") st = i < prog ? "done" : i === prog ? "run" : "wait";
    return { ...s, st, num: String(i + 1).padStart(2, "0"), dim: st === "skip" || st === "wait" };
  });

  let show = n;
  if (card) show = status === "complete" ? 3 : status === "running" ? Math.max(1, Math.min(n, prog + 1)) : Math.min(n, failAt + 1);

  const S = {
    complete: ["COMPLETE", `${n} / ${n}`, OK, "DONE"],
    error: ["ERROR", `failed at step ${failAt + 1}`, ERR, "ERROR"],
    stopped: ["STOPPED", `${failAt} / ${n}`, "#a3a5ab", "STOPPED"],
    limit: ["STEP LIMIT", "50 / 50 steps", SIG, "LIMIT"],
    running: ["RUNNING", `${prog} / ${n}`, SIG, "RUNNING"],
  }[status];
  const src = { live: ["LIVE · SOLANA", "LIVE", OK], sim: ["SIMULATED", "SIM", SIG] }[source];
  if (p.sourceLabel) src[0] = p.sourceLabel;
  const srcColor = src[2];
  const amount = p.amount ?? (source === "sim" ? "+10 SOL" : "10.4 SOL");
  const wallet = p.wallet ?? "7xQp…f3aK";
  const time = p.time ?? "14:02:11 UTC";

  if (size === "row")
    return (
      <div
        onClick={p.onOpen}
        className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border border-[#1f2125] bg-panel px-3 py-2.5 font-mono text-[11.5px] text-fg-2 transition-colors hover:border-[#34363c] hover:bg-[#15161a]"
      >
        <span
          className="inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[4px] border px-[7px] text-[10px] tracking-[0.1em]"
          style={{ borderColor: alpha(srcColor, 0.32), background: alpha(srcColor, 0.06), color: srcColor }}
        >
          <span className="h-[5px] w-[5px] rounded-[3px]" style={{ background: srcColor }} />
          {src[1]}
        </span>
        <span className="shrink-0 text-dim">{time.replace(" UTC", "")}</span>
        <span className="min-w-0 flex-1 truncate font-sans text-[13px] text-fg">{p.line ?? "Buy 10.4 SOL → Mochi the penguin was created"}</span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[10.5px] tracking-[0.1em]" style={{ color: S[2] }}>
          <span className="h-1.5 w-1.5 rounded-[3px]" style={{ background: S[2] }} />
          {S[3]}
        </span>
        <span className="shrink-0 text-faint">›</span>
      </div>
    );

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-[#23252a] bg-panel font-mono text-fg">
      <div className="flex justify-between gap-3 px-4 pt-3 text-[10.5px] tracking-[0.12em] text-dim">
        <span>
          EXECUTION <span className="text-fg-2">{p.exec ?? "0042"}</span>
        </span>
        <span>{time}</span>
      </div>
      <div className="mx-3 mt-2.5 flex flex-col gap-1.5 rounded-lg border px-3 py-2.5" style={{ borderColor: alpha(srcColor, 0.32), background: alpha(srcColor, 0.06) }}>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] tracking-[0.12em]" style={{ color: srcColor }}>
            <span className="h-1.5 w-1.5 rounded-[3px]" style={{ background: srcColor, boxShadow: `0 0 8px ${srcColor}` }} />
            {src[0]}
          </span>
          {p.trigger ? (
            <span className="inline-flex flex-wrap items-center gap-1.5 font-sans text-[13.5px] text-fg">
              {p.trigger.verb}
              {p.trigger.amount && <span className={valuePill}>{p.trigger.amount}</span>}
              {p.trigger.by && <span className="text-fg-2">{p.trigger.by}</span>}
            </span>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-1.5 font-sans text-[13.5px] text-fg">
              {source === "sim" ? "Simulator ·" : "Buy ·"} <span className={valuePill}>{amount}</span>
              <span className="text-fg-2">{source === "sim" ? "volume signal" : `by ${wallet}`}</span>
            </span>
          )}
        </div>
        {!card && p.sub !== undefined && <div className="flex flex-wrap gap-2 text-[11px] text-dim">{p.sub}</div>}
        {!card && p.sub === undefined && (
          <div className="flex flex-wrap gap-2 text-[11px] text-dim">
            <span>
              {source === "sim" ? "Sent from the builder · no Solana transaction" : `tx ${p.tx ?? "5Kd9…wQ2r"} · slot 312,884,019 ·`}
            </span>
            {source !== "sim" && <span className="border-b border-[#3a3d43] text-fg-2">Solscan ↗</span>}
          </div>
        )}
      </div>
      <div className={`flex flex-col ${card ? "px-4 pb-0.5 pt-1.5" : "px-4 pb-1 pt-2"}`}>
        {all.slice(0, show).map((s) => {
          const [mark, markColor] = MARK[s.st];
          const hasReason = s.st === "fail" || s.st === "limit";
          return (
            <div key={s.num} className={`flex flex-col gap-1 border-b border-dashed border-[#1f2125] ${card ? "py-1.5" : "py-2"}`}>
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="w-[18px] shrink-0 text-[10.5px] text-faint">{s.num}</span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 font-sans text-[13px]" style={{ color: s.dim ? "#55585e" : s.st === "fail" ? ERR : "#e8e6e1" }}>
                  {s.label}
                  {s.val && (
                    <span className={valuePill} style={{ opacity: s.dim ? 0.45 : 1 }}>
                      {s.val}
                    </span>
                  )}
                  {s.tail}
                  {s.sim && !s.dim && <span className={simChip}>SIMULATED</span>}
                </span>
                <span className={`w-3.5 shrink-0 text-center text-[12px] ${s.st === "run" ? "animate-pulse" : ""}`} style={{ color: markColor }}>
                  {mark}
                </span>
              </div>
              {hasReason && (
                <div
                  className="ml-7 rounded-md border px-2.5 py-2 font-sans text-[12.5px] leading-[1.45] text-fg text-pretty"
                  style={{ background: alpha(s.st === "fail" ? ERR : SIG, s.st === "fail" ? 0.08 : 0.07), borderColor: alpha(s.st === "fail" ? ERR : SIG, 0.35) }}
                >
                  {s.st === "fail" ? reasons.error : reasons.limit}
                </div>
              )}
            </div>
          );
        })}
        {show < n && (
          <div onClick={p.onOpen} className="cursor-pointer pl-7 pt-2 text-[11px] text-dim hover:text-fg">
            + {n - show} more steps
          </div>
        )}
      </div>
      <div className="mx-3 flex items-center justify-between gap-2.5 px-1 py-2.5 text-[11px] tracking-[0.12em]">
        <span className="inline-flex items-center gap-2" style={{ color: S[2] }}>
          <span className={`h-1.5 w-1.5 rounded-[3px] ${status === "running" ? "animate-pulse" : ""}`} style={{ background: S[2] }} />
          {S[0]}
        </span>
        <span className="tracking-[0.04em] text-fg-2">{p.countText ?? S[1]}</span>
      </div>
      {status === "stopped" && !card && <div className="mx-3 mb-2.5 font-sans text-[12.5px] text-fg-2">Stopped by the creator at 14:02:13. Steps 4 to 6 did not run.</div>}
      <div className="flex flex-wrap items-center gap-2.5 border-t border-[#1f2125] bg-canvas px-4 py-2.5 text-[11px] text-dim">
        {proof === "anchored" && (
          <>
            <span className="flex min-w-0 flex-1 flex-wrap gap-x-2 gap-y-1">
              <span>
                Program <span className="text-fg-2">a3f9c1e0</span>
              </span>
              <span>·</span>
              <span>
                receipt <span className="text-fg-2">9b27…e4d1</span>
              </span>
              <span>·</span>
              <span>
                anchored in <span className="text-ok">tx 3vLm…Pq8s ↗</span>
              </span>
            </span>
            <button
              onClick={p.onVerify}
              className="inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-md border border-ok/50 bg-ok/[0.08] px-2.5 font-mono text-[11px] tracking-[0.06em] text-[oklch(0.86_0.11_155)] hover:bg-ok/[0.18]"
            >
              ✓ Verify
            </button>
          </>
        )}
        {proof === "pending" && (
          <>
            <span className="h-2.5 w-2.5 shrink-0 animate-spin rounded-[5px] border-[1.5px] border-dashed border-signal [animation-duration:2.4s]" />
            <span className="min-w-0 flex-1">
              Program <span className="text-fg-2">a3f9c1e0</span> · receipt <span className="text-fg-2">9b27…e4d1</span> · anchoring in the next batch, about 3 min
            </span>
            <span className="inline-flex h-[26px] items-center rounded-md border border-dashed border-[#34363c] px-2.5 tracking-[0.06em] text-faint">Verify</span>
          </>
        )}
        {proof === "na" && (
          <span className="flex-1">{p.naText ?? "Simulated run · not written to Solana"}</span>
        )}
      </div>
    </div>
  );
}
