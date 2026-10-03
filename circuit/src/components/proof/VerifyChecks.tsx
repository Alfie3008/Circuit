"use client";

import { useEffect, useState } from "react";
import type { Check } from "@/lib/proof/verify";
import { ERR, OK, SIG } from "./tokens";

const MARK: Record<Check["state"], [string, string]> = {
  wait: ["○", "#3a3d43"],
  run: ["●", SIG],
  ok: ["✓", OK],
  fail: ["✕", ERR],
  skip: ["–", "#55585e"],
};

/** Runs a verification and shows each check as it finishes. Errors become a failed check, never a crash. */
export function VerifyChecks({ run, title }: { run: (update: (c: Check[]) => void) => Promise<boolean>; title: string }) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    run((c) => alive && setChecks(c)).then(
      (ok) => alive && setResult(ok),
      (e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
        setResult(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [run]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#23252a] bg-panel px-4 py-3.5 font-sans">
      <div className="flex items-center justify-between font-mono text-[10.5px] tracking-[0.12em] text-dim">
        <span>{title}</span>
        <span style={{ color: result === null ? SIG : result ? OK : ERR }}>{result === null ? "CHECKING" : result ? "VERIFIED" : "NOT VERIFIED"}</span>
      </div>
      {checks.map((c, i) => (
        <div key={i} className="flex gap-3 text-[13.5px] leading-normal">
          <span className={`w-4 shrink-0 font-mono ${c.state === "run" ? "animate-pulse" : ""}`} style={{ color: MARK[c.state][1] }}>
            {MARK[c.state][0]}
          </span>
          <div className="min-w-0">
            <div style={{ color: c.state === "wait" || c.state === "skip" ? "#6d7076" : "#e8e6e1" }}>{c.label}</div>
            {c.detail && <div className="mt-0.5 break-words font-mono text-[11px] text-fg-2">{c.detail}</div>}
          </div>
        </div>
      ))}
      {error && <p className="m-0 text-[12.5px] text-err">Couldn&apos;t finish checking: {error}</p>}
    </div>
  );
}
