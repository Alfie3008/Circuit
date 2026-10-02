"use client";

import { useEffect, useState } from "react";
import { Receipt } from "./Receipt";
import { OK, SIG } from "./tokens";

const VERIFY = {
  receipt: {
    title: "CHECK RECEIPT 9b27…e4d1",
    steps: [
      ["Read this receipt", "Fingerprint worked out in your browser: 9b27…e4d1"],
      ["Find it on Solana", "Written in a batch at 14:04:50 UTC, slot 312,884,301", "tx 3vLm…Pq8s ↗"],
      ["Match the fingerprint", "It is one of 128 receipts in that batch, and the batch proof checks out."],
      ["Match the rules", "It ran with program a3f9c1e0, published Sep 28.", "tx 4hTz…Ka1m ↗"],
    ],
    ok: ["Checked on Solana", "This receipt has not changed since 14:04 UTC."],
  },
  rules: {
    title: "CHECK THE RULES",
    steps: [
      ["Read the rules on this page", "Fingerprint of the 5 blocks, worked out in your browser: a3f9c1e0"],
      ["Find the publishing transaction", "Written by the creator wallet on Sep 28, 2026 · 09:14 UTC", "tx 4hTz…Ka1m ↗"],
      ["Match the fingerprint", "The fingerprint on Solana is a3f9c1e0. Same as this page."],
      ["Check the history", "Two earlier versions, both on Solana: 71be04d2 (Sep 21), 0c5d9a17 (Sep 14)."],
    ],
    ok: ["Rules match", "What you read here is what runs. Unchanged since Sep 28, 2026."],
  },
};

export type ProofView = { type: "receipt"; kind: "live" | "error" | "sim" | "backtest" } | { type: "verify"; kind: "receipt" | "rules" };

/**
 * Receipt viewer and the four-step "check it on Solana" walkthrough.
 * `example` marks the sample data shown in the docs.
 */
export function ProofModal({ view, onClose, example }: { view: ProofView | null; onClose: () => void; example?: boolean }) {
  const [verifying, setVerifying] = useState<"receipt" | "rules" | null>(null);
  const [step, setStep] = useState(0);
  const active = verifying ?? (view?.type === "verify" ? view.kind : null);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setStep((s) => (s >= 4 ? s : s + 1)), 700);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [view, onClose]);

  if (!view) return null;
  const close = () => {
    setVerifying(null);
    setStep(0);
    onClose();
  };
  const v = active ? VERIFY[active] : null;
  const done = step >= 4;

  return (
    <div onClick={close} className="fixed inset-0 z-[300] flex items-center justify-center bg-[rgba(5,6,7,.74)] p-6 font-sans text-fg backdrop-blur-[6px]">
      {!v && view.type === "receipt" && (
        <div onClick={(e) => e.stopPropagation()} className="flex max-h-full w-[520px] max-w-full flex-col gap-2.5 overflow-auto">
          <div className="flex justify-between font-mono text-[11px] tracking-[0.12em] text-muted">
            <span>{example ? "EXAMPLE RECEIPT" : "RECEIPT"}</span>
            <button onClick={close} className="cursor-pointer text-fg">
              CLOSE ✕
            </button>
          </div>
          <Receipt
            source={view.kind === "sim" ? "sim" : view.kind === "backtest" ? "backtest" : "live"}
            status={view.kind === "error" ? "error" : "complete"}
            onVerify={() => {
              setStep(0);
              setVerifying("receipt");
            }}
          />
        </div>
      )}
      {v && (
        <div onClick={(e) => e.stopPropagation()} className="max-h-full w-[520px] max-w-full overflow-auto rounded-[14px] border border-[#2a2c31] bg-panel shadow-[0_40px_80px_-30px_#000]">
          <div className="flex items-center justify-between border-b border-[#1f2125] px-[18px] py-3.5 font-mono text-[11px] tracking-[0.12em] text-muted">
            <span>
              {example ? "EXAMPLE · " : ""}
              {v.title}
            </span>
            <button onClick={close} className="cursor-pointer text-fg" aria-label="Close">
              ✕
            </button>
          </div>
          <div className="px-[18px] py-1.5">
            {v.steps.map(([title, detail, link], i) => {
              const d = i < step;
              const a = i === step;
              const c = d ? OK : a ? SIG : "#6d7076";
              return (
                <div key={title} className="flex gap-3.5 border-b border-dashed border-[#23252a] py-3 transition-opacity duration-200" style={{ opacity: d || a ? 1 : 0.35 }}>
                  <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[11px] border font-mono text-[11px]" style={{ borderColor: d ? OK : a ? SIG : "#34363c", color: c }}>
                    {d ? "✓" : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-medium">{title}</div>
                    <div className="mt-[3px] font-mono text-[11.5px] leading-normal text-fg-2">{detail}</div>
                    {link && (d || a) && <div className="mt-1 font-mono text-[11.5px] text-ok">{link}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div
            className="mx-[18px] mb-[18px] mt-2.5 flex items-center gap-3 rounded-[10px] border p-3.5 transition-all duration-[250ms]"
            style={{ borderColor: done ? "oklch(0.80 0.13 155 / .5)" : "#23252a", background: done ? "oklch(0.80 0.13 155 / .08)" : "#0e0f11" }}
          >
            <span className="text-[18px]" style={{ color: done ? OK : "#6d7076" }}>
              {done ? "✓" : "…"}
            </span>
            <div>
              <div className="text-[15px] font-medium">{done ? v.ok[0] : "Checking…"}</div>
              <div className="mt-0.5 text-[13px] text-fg-2">{done ? v.ok[1] : "Each step links to Solscan so you can repeat it."}</div>
            </div>
          </div>
          {example && <p className="mx-[18px] mb-4 -mt-2 font-mono text-[10.5px] text-faint">Sample data. On-chain anchoring arrives with verified rules and receipts.</p>}
        </div>
      )}
    </div>
  );
}
