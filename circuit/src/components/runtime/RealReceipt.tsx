"use client";

import { Receipt as ReceiptCard } from "@/components/proof/Receipt";
import type { Receipt } from "@/lib/runtime/state";
import { clock, runNo } from "./format";

const short = (s: string) => (s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s);

/** A real run's receipt in the design's receipt card: real trigger, steps, status and proof. */
export function RealReceipt({ r, size = "full", onOpen }: { r: Receipt; size?: "full" | "card" | "row"; onOpen?: () => void }) {
  const steps = r.entries.slice(1).map((e) => ({ label: e.text, sim: e.simulated }));
  const failAt = r.entries.slice(1).findIndex((e) => e.status === "error");
  const status =
    r.status === "running" ? "running" : r.status === "complete" ? "complete" : r.status === "step_limit" ? "limit" : r.status === "stopped" ? "stopped" : "error";
  const proof = r.event.proof;
  const kind = r.event.source;
  const d = r.event.data;
  const source = proof ? "live" : "sim";
  const sourceLabel = proof ? undefined : kind === "runtime" ? "RAISED BY THE PROGRAM" : kind === "schedule" ? "SCHEDULED · SERVER CLOCK" : undefined;
  const amount = typeof d.amount === "number" ? `${Math.round(d.amount * 1000) / 1000} SOL` : undefined;
  const by = typeof d.wallet === "string" && d.wallet && !d.wallet.startsWith("sim") ? `by ${short(d.wallet)}` : undefined;

  const sub = proof ? (
    <>
      <span>
        tx {short(proof.signature)} · slot {proof.slot.toLocaleString()} ·
      </span>
      <a href={proof.explorer} target="_blank" rel="noreferrer" className="border-b border-[#3a3d43] text-fg-2 hover:text-signal" onClick={(e) => e.stopPropagation()}>
        Solscan ↗
      </a>
    </>
  ) : kind === "runtime" ? (
    <span>Raised by another block in this program</span>
  ) : kind === "schedule" ? (
    <span>The server&apos;s clock · no Solana transaction</span>
  ) : (
    <span>Sent from the builder · no Solana transaction</span>
  );

  return (
    <ReceiptCard
      size={size}
      source={source}
      sourceLabel={sourceLabel}
      status={status}
      progress={status === "running" ? steps.length : undefined}
      failAt={failAt >= 0 ? failAt : undefined}
      reason={r.error ?? undefined}
      steps={steps.length ? steps : [{ label: "Nothing to do" }]}
      exec={runNo(r.id).slice(1)}
      time={`${clock(r.startedAt)}`}
      line={r.event.label}
      trigger={{ verb: r.event.label, amount: r.event.type === "trade" ? amount : undefined, by }}
      sub={sub}
      naText={proof ? "Real transaction · receipt not yet anchored on Solana (coming with verified receipts)" : source === "sim" && kind !== "schedule" && kind !== "runtime" ? "Simulated run · not written to Solana" : "Not written to Solana"}
      countText={`${r.steps} ${r.steps === 1 ? "step" : "steps"}`}
      onOpen={onOpen}
    />
  );
}
