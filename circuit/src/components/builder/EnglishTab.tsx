"use client";

import { useEffect, useMemo } from "react";
import { Words } from "@/components/runtime/Words";
import { CATEGORIES } from "@/lib/blocks/categories";
import { explainProgram } from "@/lib/explain/explain";
import { resolveSpec, type IRNode, type Program } from "@/lib/ir";
import { hueColour } from "@/lib/ui/colour";
import { markBlock, useProjectStore } from "@/store/project";

/** Block id → category, for the chip beside each sentence. */
function categoriesById(program: Program) {
  const out = new Map<string, string>();
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const node = v as IRNode;
    if (typeof node.type === "string" && typeof node.id === "string") {
      const spec = resolveSpec(node);
      if (spec) out.set(node.id, spec.category);
    }
    Object.values(node).forEach(visit);
  };
  program.scripts.forEach((s) => {
    visit(s.event);
    visit(s.body);
  });
  return out;
}

function Chip({ category }: { category?: string }) {
  const meta = CATEGORIES.find((c) => c.id === category);
  if (!meta) return <span className="w-[22px] shrink-0" />;
  return (
    <span
      className="mt-1 h-[15px] shrink-0 rounded-[3px] border px-[3px] font-mono text-[9px] leading-[13px] tracking-[0.06em]"
      style={{ color: hueColour(meta.hue), borderColor: hueColour(meta.hue, 0.5, 0.06) }}
    >
      {meta.code}
    </span>
  );
}

/** ENGLISH: the program as the sentences holders will read. Hover a sentence → its block lights; select a block → its sentence lights. */
export function EnglishTab() {
  const program = useProjectStore((s) => s.program);
  const irError = useProjectStore((s) => s.irError);
  const selected = useProjectStore((s) => s.selectedBlockId);
  const sections = useMemo(() => (program ? explainProgram(program) : []), [program]);
  const cats = useMemo(() => (program ? categoriesById(program) : new Map<string, string>()), [program]);
  useEffect(() => () => markBlock("hover", null), []);

  const row = (key: string, id: string | undefined, depth: number, content: React.ReactNode, head = false) => {
    const lit = !!id && id === selected;
    return (
      <div
        key={key}
        onMouseEnter={() => markBlock("hover", id)}
        className={`flex gap-2.5 rounded-lg border py-[9px] pr-2.5 transition-colors ${
          lit ? "border-[oklch(0.42_0.05_235)] bg-[oklch(0.29_0.035_235)]/40" : "border-transparent hover:border-[#2a2c31] hover:bg-white/[0.03]"
        }`}
        style={{ paddingLeft: 10 + depth * 16 }}
      >
        <Chip category={id ? cats.get(id) : undefined} />
        <span className={`text-[14.5px] leading-[1.55] text-pretty ${head ? "font-medium text-fg" : "text-fg-2"}`}>{content}</span>
      </div>
    );
  };

  return (
    <div onMouseLeave={() => markBlock("hover", null)}>
      <div className="mx-1 mb-3 mt-0.5 font-mono text-[10.5px] tracking-[0.12em] text-dim">WHAT HOLDERS WILL READ</div>
      {!program && <p className="px-1 text-[13px] text-err">The program has an error, so it can&apos;t be read yet.{irError ? `\n${irError}` : ""}</p>}
      {program && sections.length === 0 && <p className="px-1 text-[13px] text-dim">No scripts yet. Start one with an event block.</p>}
      <div className="flex flex-col gap-1">
        {sections.map((s, i) => (
          <div key={i} className="flex flex-col gap-1">
            {row(`h${i}`, s.hatId, 0, <Words parts={s.title} />, true)}
            {s.lines.map((l, j) => row(`l${i}.${j}`, l.id, l.depth + 1, <Words parts={l.parts} />))}
          </div>
        ))}
      </div>
      <div className="mt-3.5 border-t border-dashed border-[#23252a] px-1 pt-2.5 font-mono text-[10.5px] leading-[1.6] text-dim">
        Hover a sentence to find its block, or select a block to find its sentence. Updates on every edit.
      </div>
    </div>
  );
}
