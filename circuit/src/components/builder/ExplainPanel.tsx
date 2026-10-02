"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { XIcon } from "@/components/ui/icons";
import { explainProgram, toText, type Part } from "@/lib/explain/explain";
import { markBlock, useProjectStore } from "@/store/project";

function Words({ parts }: { parts: Part[] }) {
  return (
    <>
      {parts.map((p, i) =>
        "text" in p ? (
          <span key={i}>{p.text} </span>
        ) : (
          <span
            key={i}
            className={`mr-1 inline-block rounded-full border px-1.5 font-mono text-[12px] leading-[19px] ${
              p.kind === "var"
                ? "border-[oklch(0.42_0.05_235)] bg-[oklch(0.29_0.035_235)] text-var"
                : p.kind === "event"
                  ? "border-ok/40 text-ok"
                  : "border-line-2 bg-canvas text-fg"
            }`}
          >
            {p.value}
          </span>
        ),
      )}
    </>
  );
}

/** The program as plain English, linked to the blocks it describes. */
export function ExplainPanel({ onClose }: { onClose: () => void }) {
  const program = useProjectStore((s) => s.program);
  const irError = useProjectStore((s) => s.irError);
  const selected = useProjectStore((s) => s.selectedBlockId);
  const sections = useMemo(() => (program ? explainProgram(program) : []), [program]);
  const [copied, setCopied] = useState(false);

  useEffect(() => () => markBlock("hover", null), []);

  const plain = sections
    .map((s) => [toText(s.title), ...s.lines.map((l) => `${"  ".repeat(l.depth + 1)}${toText(l.parts)}`)].join("\n"))
    .join("\n\n");

  return (
    <motion.section
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="absolute inset-y-0 right-0 z-20 flex w-[440px] max-w-full flex-col border-l border-line bg-panel/95 shadow-2xl shadow-black/40 backdrop-blur"
      aria-label="Program in plain English"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 className="font-mono text-[11px] tracking-[0.12em] text-muted">IN PLAIN ENGLISH</h2>
        {program && (
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(plain).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            }}
            className="ml-auto rounded-md border border-line px-2 py-0.5 text-xs text-muted hover:text-fg"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        <button onClick={onClose} aria-label="Close" className={`${program ? "" : "ml-auto"} rounded-md p-1 text-muted hover:text-fg`}>
          <XIcon width={14} height={14} />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4" onMouseLeave={() => markBlock("hover", null)}>
        {!program && <p className="text-[13.5px] text-err">The program has an error, so it can&apos;t be explained yet.{irError ? `\n${irError}` : ""}</p>}
        {program && sections.length === 0 && <p className="text-[13.5px] text-dim">No scripts yet. Start one with an event block.</p>}
        {sections.map((s, i) => (
          <section key={i} className="mb-6">
            <h3
              className="mb-2 text-[15px] font-medium leading-snug"
              onMouseEnter={() => markBlock("hover", s.hatId)}
            >
              <Words parts={s.title} />
            </h3>
            <ol className="flex flex-col gap-1">
              {s.lines.map((l, j) => (
                <li
                  key={j}
                  onMouseEnter={() => markBlock("hover", l.id)}
                  style={{ paddingLeft: 12 + l.depth * 18 }}
                  className={`rounded-md py-1 pr-2 text-[14px] leading-relaxed text-fg-2 transition-colors hover:bg-white/[0.04] hover:text-fg ${
                    l.id && l.id === selected ? "bg-[oklch(0.29_0.035_235)]/40 text-fg" : ""
                  }`}
                >
                  <Words parts={l.parts} />
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <p className="border-t border-line px-4 py-2 text-[11.5px] text-dim">Written from the blocks themselves, so it always matches. Hover a line to find its block.</p>
    </motion.section>
  );
}
