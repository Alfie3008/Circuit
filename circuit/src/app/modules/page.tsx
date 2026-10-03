import type { Metadata } from "next";
import { StaticBlocks } from "@/components/blocks/StaticBlocks";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { CATEGORIES } from "@/lib/blocks/categories";
import type { BlockSpec } from "@/lib/blocks/types";
import { MODULE_ART, moduleSample } from "@/lib/marketing/moduleCards";
import { blocksOf, blockTitle, MODULE_INFO, STATUS_TEXT, type ModuleStatus } from "@/lib/modules";
import { hueColour } from "@/lib/ui/colour";
import { CreateModuleDemo } from "./CreateModuleDemo";

export const metadata: Metadata = { title: "Modules · CIRCUIT", description: "A module is a set of blocks for one system." };

const tone: Record<ModuleStatus, string> = {
  "built-in": "border-ok/40 text-ok",
  local: "border-ok/40 text-ok",
  live: "border-ok/40 text-ok",
  mock: "border-signal/40 text-[oklch(0.88_0.13_80)]",
  simulated: "border-signal/40 text-[oklch(0.88_0.13_80)]",
};

function BlockList({ title, blocks }: { title: string; blocks: BlockSpec[] }) {
  if (!blocks.length) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1.5 font-mono text-[10px] tracking-[0.12em] text-dim">
        {title} · {blocks.length}
      </p>
      <ul className="flex flex-col gap-1">
        {blocks.map((b) => (
          <li key={b.type} className="truncate font-mono text-[11.5px] text-fg-2" title={b.tooltip}>
            {blockTitle(b)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ModulesPage() {
  return (
    <div className="min-h-screen bg-ink">
      <SiteNav active="/modules" />
      <section className="px-6 pb-[120px] pt-[88px]">
        <div className="mx-auto max-w-[1240px]">
          <div className="font-mono text-[11.5px] tracking-[0.14em] text-dim">MODULES</div>
          <h1 className="mt-2.5 text-[clamp(40px,6vw,80px)] font-medium leading-none tracking-[-0.045em]">Anything can become a block.</h1>
          <p className="mt-5 max-w-[540px] text-[18px] leading-normal text-fg-2">
            A module is a set of blocks for one system. Every module&apos;s blocks are in the builder palette, and the interpreter runs them all the same way.
          </p>
          <div className="mt-14 grid grid-cols-[repeat(auto-fill,minmax(min(100%,380px),1fr))] gap-3">
            {MODULE_INFO.map((m) => {
              const blocks = blocksOf(m.id);
              const all = [...blocks.events, ...blocks.values, ...blocks.actions];
              const cat = CATEGORIES.find((c) => c.id === all[0]?.category);
              return (
                <div key={m.id} className="flex flex-col overflow-hidden rounded-[14px] border border-[#23252a] bg-panel">
                  <div className="flex items-center justify-between border-b border-[#1f2125] px-[18px] py-4">
                    <div className="flex items-center gap-2.5">
                      {cat && (
                        <span className="rounded-[3px] border px-1 font-mono text-[9.5px]" style={{ color: hueColour(cat.hue), borderColor: hueColour(cat.hue, 0.5, 0.06) }}>
                          {cat.code}
                        </span>
                      )}
                      <span className="font-mono text-[13px] font-semibold tracking-[0.14em]">{m.name.toUpperCase()}</span>
                    </div>
                    <span className="font-mono text-[10.5px] tracking-[0.1em] text-dim">{all.length} BLOCKS</span>
                  </div>
                  <pre className="m-0 min-h-[96px] px-5 pt-[18px] font-mono text-[11px] leading-[1.25] text-dim">{MODULE_ART[m.id] ?? ""}</pre>
                  <div className="flex flex-col gap-1.5 px-5 pb-4">
                    <span className={`self-start rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[0.06em] ${tone[m.status]}`}>{STATUS_TEXT[m.status]}</span>
                    <p className="m-0 text-[13.5px] leading-normal text-fg-2">{m.description}</p>
                    {m.next && <p className="m-0 text-[12px] leading-normal text-dim">{m.next}</p>}
                  </div>
                  <div
                    className="relative h-[260px] overflow-hidden border-t border-[#1f2125] px-5 pb-6 pt-[18px]"
                    style={{ backgroundColor: "#0e0f11", backgroundImage: "radial-gradient(circle,#ffffff10 1px,transparent 1.3px)", backgroundSize: "18px 18px" }}
                  >
                    <StaticBlocks program={moduleSample(m.id)} zoom={0.72} gap={14} />
                    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-[#0e0f11]" />
                  </div>
                  <details className="group border-t border-[#1f2125] px-5 py-3">
                    <summary className="cursor-pointer list-none font-mono text-[11px] tracking-[0.08em] text-dim hover:text-fg">
                      <span className="group-open:hidden">Show all {all.length} blocks ▾</span>
                      <span className="hidden group-open:inline">Hide blocks ▴</span>
                    </summary>
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      <BlockList title="EVENTS" blocks={blocks.events} />
                      <BlockList title="VALUES" blocks={blocks.values} />
                      <BlockList title="ACTIONS" blocks={blocks.actions} />
                    </div>
                  </details>
                </div>
              );
            })}
            <a
              href="#create-module"
              className="flex min-h-[280px] flex-col justify-between gap-6 rounded-[14px] border border-dashed border-signal/50 p-6 text-fg hover:bg-white/[0.02] hover:text-fg"
            >
              <span className="font-mono text-[13px] font-semibold tracking-[0.14em] text-muted">YOUR MODULE</span>
              <div>
                <p className="m-0 mb-[18px] max-w-[300px] text-[15px] leading-normal text-fg-2">Wrap any API, contract or service as typed blocks with inputs, outputs and state.</p>
                <span className="text-[20px] font-medium text-[oklch(0.88_0.13_80)]">Build a block →</span>
              </div>
            </a>
          </div>
          <div id="create-module" className="scroll-mt-24">
            <CreateModuleDemo />
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
