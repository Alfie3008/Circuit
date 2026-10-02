import type { Metadata } from "next";
import Link from "next/link";
import { StaticBlocks } from "@/components/blocks/StaticBlocks";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { BLANK, countBlocks } from "@/lib/marketing/demos";
import { TEMPLATES } from "@/lib/templates";

export const metadata: Metadata = { title: "Examples · CIRCUIT", description: "Start from a working program. Open one, run it, change anything." };

const ITEMS = [
  ...TEMPLATES.map((t) => ({ id: t.id, title: t.name, desc: t.description, program: t.program })),
  { id: "blank", title: "Blank", desc: "Start from nothing: one event, ready for blocks.", program: BLANK },
];

export default function ExamplesPage() {
  return (
    <div className="min-h-screen bg-ink">
      <SiteNav active="/examples" />
      <section className="px-6 pb-[120px] pt-[88px]">
        <div className="mx-auto max-w-[1240px]">
          <div className="font-mono text-[11.5px] tracking-[0.14em] text-dim">EXAMPLES</div>
          <h1 className="mt-2.5 text-[clamp(40px,6vw,80px)] font-medium leading-none tracking-[-0.045em]">Start from a working program.</h1>
          <p className="mt-5 max-w-[520px] text-[18px] leading-normal text-fg-2">Every template is built from the same generic blocks. Open one, run it, change anything.</p>
          <div className="mt-14 grid grid-cols-[repeat(auto-fill,minmax(min(100%,380px),1fr))] gap-3">
            {ITEMS.map((it) => {
              const n = countBlocks(it.program);
              return (
                <div key={it.id} className="flex flex-col overflow-hidden rounded-[14px] border border-[#23252a] bg-panel">
                  <div
                    className="relative h-[300px] overflow-hidden border-b border-[#1f2125] px-6 py-7"
                    style={{ backgroundColor: "#0e0f11", backgroundImage: "radial-gradient(circle,#ffffff12 1px,transparent 1.3px)", backgroundSize: "18px 18px" }}
                  >
                    <StaticBlocks program={it.program} zoom={0.7} />
                    <div className="absolute inset-x-0 bottom-0 h-[60px] bg-gradient-to-b from-transparent to-[#0e0f11]" />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 px-[22px] pb-[22px] pt-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[20px] font-medium tracking-[-0.02em]">{it.title}</span>
                      <span className="font-mono text-[10.5px] tracking-[0.1em] text-dim">
                        {n} {n === 1 ? "BLOCK" : "BLOCKS"}
                      </span>
                    </div>
                    <p className="m-0 flex-1 text-[14.5px] leading-normal text-fg-2">{it.desc}</p>
                    <Link
                      href={`/build?template=${it.id}`}
                      className="mt-3 inline-flex h-9 items-center self-start rounded-[7px] border border-[#34363c] px-3.5 text-[13.5px] text-fg hover:bg-white/[0.04] hover:text-fg"
                    >
                      Open Program →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
