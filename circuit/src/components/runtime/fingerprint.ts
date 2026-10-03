"use client";

import { useEffect, useState } from "react";
import { canonicalRules } from "@/lib/ir/fingerprint";

/** SHA-256 of a program's rules, first 8 hex characters, worked out in the browser. */
export function useFingerprint(program: unknown) {
  const [fp, setFp] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const bytes = new TextEncoder().encode(canonicalRules(program));
    void crypto.subtle?.digest("SHA-256", bytes).then((d) => {
      if (alive) setFp([...new Uint8Array(d)].slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join(""));
    });
    return () => {
      alive = false;
    };
  }, [program]);
  return fp;
}
