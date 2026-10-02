import type { Metadata } from "next";
import { LogoMark, Lockup, Wordmark } from "@/components/site/Logo";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";

export const metadata: Metadata = { title: "Brand · CIRCUIT", description: "The Status mark, wordmark, colour and type." };

const PAPER = "#f4f2ed";
const DEEP = "oklch(0.72 0.16 68)";
const label = "font-mono text-[11.5px] tracking-[0.14em] text-dim";
const caption = "flex justify-between font-mono text-[11px] text-dim";

const CORE = [
  ["Graphite", "#0B0C0D", "#0b0c0d", "Background"],
  ["Panel", "#111214", "#111214", "Cards, panels"],
  ["Bone", "#E8E6E1", "#e8e6e1", "Ink, mark"],
  ["Signal", "#FDBE45 · oklch(0.84 0.15 80)", "oklch(0.84 0.15 80)", "Action, running, simulated"],
  ["Paper", "#F4F2ED", PAPER, "Light backgrounds"],
];
const STATES = [
  ["Live", "oklch(0.80 0.13 155)", "Real, complete"],
  ["Error", "oklch(0.68 0.19 25)", "Failed steps"],
  ["Value", "oklch(0.86 0.06 235)", "Variables, backtest"],
  ["Deep signal", DEEP, "#E58E00 · signal on paper"],
  ["Dim", "#6D7076", "Labels, meta"],
];
const RULES = [
  ["Block", "36 × 36u"],
  ["Corner cut", "13 × 13u"],
  ["Light", "14 × 14u"],
  ["Gap", "3u"],
];

function Corners({ inset = 16 }: { inset?: number }) {
  const c = "absolute h-3.5 w-3.5 border-[#3a3d43]";
  return (
    <>
      <span className={`${c} border-l border-t`} style={{ left: inset, top: inset }} />
      <span className={`${c} border-r border-t`} style={{ right: inset, top: inset }} />
      <span className={`${c} border-b border-l`} style={{ left: inset, bottom: inset }} />
      <span className={`${c} border-b border-r`} style={{ right: inset, bottom: inset }} />
    </>
  );
}

export default function BrandPage() {
  return (
    <div className="min-h-screen bg-ink">
      <SiteNav />
      <div className="mx-auto flex max-w-[1240px] flex-col gap-24 px-6 pb-[120px] pt-16">
        <section className="flex flex-wrap items-center justify-between gap-12">
          <div className="min-w-0 flex-[1_1_420px]">
            <h1 className="m-0 text-[clamp(52px,8vw,120px)] font-semibold uppercase leading-[0.86] tracking-[-0.06em]">
              Every block.
              <br />
              <span className="text-signal">One light.</span>
            </h1>
            <p className="mt-7 max-w-[480px] text-[18px] leading-normal text-fg-2 text-pretty">
              The mark is a single block with its status light lifted out of the corner. In the builder that light means a block is running. Here it means the whole coin
              is.
            </p>
          </div>
          <div className="relative flex aspect-square min-w-0 flex-[0_1_440px] items-center justify-center rounded-[20px] border border-[#1f2125] bg-ink">
            <Corners />
            <LogoMark size={220} />
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div className={label}>PRIMARY MARK</div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] gap-4">
            <div className="flex flex-col gap-2.5">
              <div className="flex aspect-[4/3] items-center justify-center rounded-2xl border border-[#1f2125] bg-ink">
                <LogoMark size={160} />
              </div>
              <div className={caption}>
                <span>ON GRAPHITE</span>
                <span>BONE #E8E6E1 + SIGNAL</span>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="flex aspect-[4/3] items-center justify-center rounded-2xl" style={{ background: PAPER }}>
                <LogoMark size={160} ink="#0b0c0d" accent={DEEP} />
              </div>
              <div className={caption}>
                <span>ON PAPER</span>
                <span>GRAPHITE #0B0C0D + DEEP SIGNAL</span>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div className={label}>WORDMARK AND LOCKUP</div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] gap-4">
            <div className="flex h-[200px] items-center justify-center rounded-2xl border border-[#1f2125] bg-ink">
              <Wordmark size={44} />
            </div>
            <div className="flex h-[200px] items-center justify-center rounded-2xl" style={{ background: PAPER }}>
              <Wordmark size={44} ink="#0b0c0d" />
            </div>
            <div className="flex h-[200px] items-center justify-center rounded-2xl border border-[#1f2125] bg-ink">
              <Lockup size={56} />
            </div>
            <div className="flex h-[200px] items-center justify-center rounded-2xl" style={{ background: PAPER }}>
              <Lockup size={56} ink="#0b0c0d" accent={DEEP} />
            </div>
          </div>
          <p className="m-0 max-w-[640px] text-[14px] leading-[1.55] text-dim">
            Wordmark: Geist Mono SemiBold, uppercase, tracked +220. In the lockup the mark is 1.9× the cap height, with a gap of 0.38× the mark.
          </p>
        </section>

        <section className="flex flex-wrap items-center gap-10">
          <div
            className="relative aspect-square min-w-0 flex-[0_1_480px] overflow-hidden rounded-2xl border border-[#1f2125]"
            style={{
              backgroundColor: "#0e0f11",
              backgroundImage: "linear-gradient(#ffffff0d 1px,transparent 1px),linear-gradient(90deg,#ffffff0d 1px,transparent 1px)",
              backgroundSize: "calc(100% / 32) calc(100% / 32)",
            }}
          >
            <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full opacity-90" aria-hidden>
              <path d="M12 16H35V29H48V52H12Z" fill="#e8e6e1" />
              <rect x="38" y="12" width="14" height="14" fill="oklch(0.84 0.15 80)" />
            </svg>
          </div>
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5">
            <div className={label}>CONSTRUCTION · 64-UNIT GRID</div>
            <div className="flex flex-col border-t border-[#1f2125] text-[15px]">
              {RULES.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-[#1f2125] py-3">
                  <span>{k}</span>
                  <span className="font-mono text-[13px] text-fg-2">{v}</span>
                </div>
              ))}
            </div>
            <p className="m-0 text-[14px] leading-[1.55] text-dim text-pretty">Square corners only, like the blocks. The light is the only colour in the mark.</p>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div className={label}>APP ICON AND SMALL SIZES</div>
          <div className="flex flex-wrap items-end gap-7">
            {[
              { box: 128, r: 28, mark: 80, bg: "#111214", tag: "128" },
              { box: 128, r: 28, mark: 80, bg: "oklch(0.84 0.15 80)", tag: "128 · SIGNAL", ink: "#0b0c0d", accent: PAPER },
              { box: 64, r: 14, mark: 40, bg: "#111214", tag: "64" },
              { box: 32, r: 7, mark: 22, bg: "#111214", tag: "32" },
            ].map((i) => (
              <div key={i.tag} className="flex flex-col items-center gap-2.5">
                <div
                  className="flex items-center justify-center"
                  style={{ width: i.box, height: i.box, borderRadius: i.r, background: i.bg, border: i.ink ? "none" : "1px solid #2a2c31" }}
                >
                  <LogoMark size={i.mark} ink={i.ink} accent={i.accent} />
                </div>
                <span className="font-mono text-[11px] text-dim">{i.tag}</span>
              </div>
            ))}
            <div className="flex flex-col items-center gap-2.5">
              <LogoMark size={16} />
              <span className="font-mono text-[11px] text-dim">16 · MIN</span>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div className={label}>COLOUR</div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3">
            {CORE.map(([name, hex, v, use]) => (
              <div key={name} className="flex flex-col overflow-hidden rounded-xl border border-[#1f2125] bg-panel">
                <div className="h-[140px] border-b border-[#1f2125]" style={{ background: v }} />
                <div className="flex flex-col gap-1 px-3.5 py-3">
                  <span className="text-[15px] font-medium">{name}</span>
                  <span className="font-mono text-[11.5px] text-fg-2">{hex}</span>
                  <span className="font-mono text-[11px] text-dim">{use}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,140px),1fr))] gap-3">
            {STATES.map(([name, v, use]) => (
              <div key={name} className="flex items-center gap-3 rounded-[10px] border border-[#1f2125] bg-panel p-3">
                <span className="h-7 w-7 shrink-0 rounded-md" style={{ background: v }} />
                <div className="min-w-0">
                  <div className="text-[14px]">{name}</div>
                  <div className="font-mono text-[10.5px] text-dim">{use}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="m-0 max-w-[640px] text-[14px] leading-[1.55] text-dim">
            Graphite and bone carry almost everything. Signal amber is kept for action, running and simulated. Green, red and blue are functional states and never
            decorative.
          </p>
        </section>

        <section className="flex flex-col gap-5">
          <div className={label}>TYPE</div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-4">
            <div className="flex flex-col gap-3.5 rounded-2xl border border-[#1f2125] bg-panel p-7">
              <span className="font-mono text-[11px] tracking-[0.12em] text-dim">GEIST · READING, HEADLINES</span>
              <span className="text-[clamp(40px,11vw,64px)] font-semibold uppercase leading-[0.9] tracking-[-0.05em]">Make your coin do something.</span>
              <span className="text-[17px] leading-normal text-fg-2">Program onchain events, AI, APIs and digital worlds with blocks.</span>
            </div>
            <div className="flex flex-col gap-3.5 rounded-2xl border border-[#1f2125] bg-panel p-7 font-mono">
              <span className="text-[11px] tracking-[0.12em] text-dim">GEIST MONO · LABELS, DATA, BLOCKS</span>
              <span className="text-[13px] font-semibold tracking-[0.06em]">
                WHEN VOLUME REACHES <span className="rounded-[4px] border border-[#34373d] bg-[#22252a] px-[7px] py-px font-medium">10 SOL</span>
              </span>
              <span className="text-[12px] tracking-[0.12em] text-fg-2">EXECUTION 0042 · 14:02:11 UTC</span>
              <span className="text-[12px] text-dim">a3f9c1e0 · tx 3vLm…Pq8s ↗</span>
            </div>
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
