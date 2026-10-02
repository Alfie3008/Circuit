import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES } from "@/lib/blocks/categories";
import type { BlockSpec } from "@/lib/blocks/types";
import { blocksOf, blockTitle, MODULE_INFO, STATUS_TEXT, type ModuleStatus } from "@/lib/modules";
import { hueColour } from "@/lib/ui/colour";
import { CreateModuleDemo } from "./CreateModuleDemo";

export const metadata: Metadata = { title: "Modules · CIRCUIT" };

const tone: Record<ModuleStatus, string> = {
  "built-in": "border-ok/40 text-ok",
  local: "border-ok/40 text-ok",
  mock: "border-signal/40 text-[oklch(0.88_0.13_80)]",
  simulated: "border-signal/40 text-[oklch(0.88_0.13_80)]",
};

function Column({ title, blocks }: { title: string; blocks: BlockSpec[] }) {
  if (!blocks.length) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1.5 font-mono text-[10.5px] tracking-[0.12em] text-dim">
        {title} · {blocks.length}
      </p>
      <ul className="flex flex-col gap-1">
        {blocks.map((b) => {
          const cat = CATEGORIES.find((c) => c.id === b.category)!;
          return (
            <li key={b.type} className="flex items-baseline gap-2 text-[12.5px] text-fg-2" title={b.tooltip}>
              <span
                className="shrink-0 rounded-[3px] border px-1 font-mono text-[9px] leading-[12px]"
                style={{ color: hueColour(cat.hue), borderColor: hueColour(cat.hue, 0.5, 0.06) }}
              >
                {cat.code}
              </span>
              <span className="truncate font-mono">{blockTitle(b)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ModulesPage() {
  return (
    <div className="min-h-dvh bg-ink">
      <header className="sticky top-0 z-10 flex h-[52px] items-center gap-4 border-b border-[#1d1f23] bg-ink/90 px-6 backdrop-blur">
        <Link href="/" className="font-mono text-[13px] font-semibold tracking-[0.18em]">
          CIRCUIT
        </Link>
        <span className="h-4 w-px bg-line-2" />
        <span className="font-mono text-[12px] text-dim">modules</span>
        <Link href="/build" className="ml-auto rounded-md border border-line-2 px-3 py-1 font-mono text-[12px] text-fg-2 hover:text-fg">
          ← Builder
        </Link>
      </header>

      <main className="mx-auto max-w-[1180px] px-6 py-10">
        <p className="font-mono text-[11.5px] tracking-[0.14em] text-dim">INSTALLED · {MODULE_INFO.length}</p>
        <h1 className="mt-2 text-[40px] font-medium tracking-[-0.035em]">Modules</h1>
        <p className="mt-3 max-w-[640px] text-[16px] leading-relaxed text-fg-2">
          Every integration is a module that adds events, values and actions as blocks. The interpreter runs them all the same way,
          and only reaches the outside world through each module&apos;s adapter.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          {MODULE_INFO.map((m) => {
            const blocks = blocksOf(m.id);
            return (
              <section key={m.id} className="rounded-[14px] border border-[#23252a] bg-panel p-5">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-[20px] font-medium tracking-[-0.02em]">{m.name}</h2>
                  <span className={`rounded-full border px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] ${tone[m.status]}`}>{STATUS_TEXT[m.status]}</span>
                </div>
                <p className="mt-1.5 text-[14px] text-fg-2">{m.description}</p>
                {m.next && <p className="mt-1 text-[12.5px] text-dim">{m.next}</p>}
                <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
                  <Column title="EVENTS" blocks={blocks.events} />
                  <Column title="VALUES" blocks={blocks.values} />
                  <Column title="ACTIONS" blocks={blocks.actions} />
                </div>
              </section>
            );
          })}
        </div>

        <CreateModuleDemo />
      </main>
    </div>
  );
}
