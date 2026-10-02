"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { XIcon } from "@/components/ui/icons";
import { useProjectStore } from "@/store/project";

/** Live Circuit IR for the workspace: what the interpreter runs and what files store. */
export function IrPanel({ onClose }: { onClose: () => void }) {
  const program = useProjectStore((s) => s.program);
  const irError = useProjectStore((s) => s.irError);
  const [copied, setCopied] = useState(false);
  const json = program ? JSON.stringify(program, null, 2) : "";

  return (
    <motion.section
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="absolute inset-y-0 right-0 z-20 flex w-[440px] max-w-full flex-col border-l border-line bg-panel/95 shadow-2xl shadow-black/40 backdrop-blur"
      aria-label="Circuit IR"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold">Circuit IR</h2>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
            program ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
          }`}
        >
          {program ? "valid" : "invalid"}
        </span>
        {program && (
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(json).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
            className="ml-auto rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:text-fg"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        <button onClick={onClose} aria-label="Close IR panel" className={`${program ? "" : "ml-auto"} rounded-md p-1 text-muted hover:text-fg`}>
          <XIcon width={14} height={14} />
        </button>
      </header>
      <p className="border-b border-line px-4 py-2 text-xs text-muted">
        Blocks and the IR are the same program. Edit the blocks and this updates live.
      </p>
      <pre className="flex-1 overflow-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed text-fg/90">
        {program ? json : <span className="whitespace-pre-wrap text-red-300">{irError}</span>}
      </pre>
    </motion.section>
  );
}
