import Link from "next/link";
import { StaticBlocks } from "@/components/blocks/StaticBlocks";
import { HomeDebug } from "@/components/home/HomeDebug";
import { HomeDescribe } from "@/components/home/HomeDescribe";
import { HomeLego } from "@/components/home/HomeLego";
import { AsciiCoin } from "@/components/site/AsciiCoin";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { Ticker } from "@/components/site/Ticker";
import { UtcClock } from "@/components/site/UtcClock";
import { CATEGORIES } from "@/lib/blocks/categories";
import { BLANK, TINY } from "@/lib/marketing/demos";
import { MODULE_CARDS } from "@/lib/marketing/modules";
import { hueColour } from "@/lib/ui/colour";

const primary =
  "inline-flex items-center whitespace-nowrap rounded-lg bg-signal font-medium text-signal-ink hover:text-signal-ink hover:brightness-[1.08]";
const secondary = "inline-flex items-center whitespace-nowrap rounded-lg border border-[#34363c] text-fg hover:bg-white/[0.04] hover:text-fg";
const h2 = "mt-2.5 text-[clamp(36px,5.4vw,72px)] font-medium leading-none tracking-[-0.045em]";
const section = "border-t border-[#17191c] px-6 py-[120px]";
const mono = "font-mono";

function Corner({ pos }: { pos: string }) {
  return <span className={`absolute h-3.5 w-3.5 border-[#3a3d43] ${pos}`} />;
}

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-ink">
      <SiteNav />

      {/* HERO */}
      <section className="relative overflow-hidden px-6 pb-10 pt-16">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px)",
            backgroundSize: "80px 80px",
            maskImage: "radial-gradient(ellipse 70% 80% at 70% 30%,#000 10%,transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 80% at 70% 30%,#000 10%,transparent 75%)",
          }}
        />
        <div className="pointer-events-none absolute -top-[20%] right-[-10%] h-[120%] w-[70%]" style={{ background: "radial-gradient(closest-side,oklch(0.84 0.15 80 / .07),transparent)" }} />
        <div className="relative mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-8">
          <div className="min-w-0 flex-[1_1_580px]">
            <h1 className="m-0 text-[clamp(52px,8.6vw,132px)] font-semibold uppercase leading-[0.86] tracking-[-0.06em]">
              Make your coin
              <br />
              <span className="text-signal">do something.</span>
            </h1>
            <p className="mt-8 max-w-[500px] text-[clamp(17px,1.6vw,20px)] leading-[1.45] text-fg-2 text-pretty">
              Program onchain events, AI, APIs and digital worlds with blocks. No code required.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <Link href="/build" className={`${primary} h-12 px-[22px] text-[15px]`} style={{ boxShadow: "0 0 0 1px oklch(0.84 0.15 80),0 8px 30px -8px oklch(0.84 0.15 80 / .6)" }}>
                Open Builder →
              </Link>
              <a href="#describe" className={`${secondary} h-12 bg-panel px-[22px] text-[15px]`}>
                Describe an idea
              </a>
            </div>
          </div>
          <div className="relative flex min-w-0 flex-[0_1_560px] justify-center py-7">
            <Corner pos="left-0 top-0 border-l border-t" />
            <Corner pos="right-0 top-0 border-r border-t" />
            <Corner pos="left-0 bottom-0 border-l border-b" />
            <Corner pos="right-0 bottom-0 border-r border-b" />
            <span className={`absolute left-5 top-2 ${mono} text-[10px] tracking-[0.14em] text-faint`}>FIG. 01</span>
            <span className={`absolute right-5 top-2 ${mono} text-[10px] tracking-[0.14em] text-faint`}>
              <UtcClock /> UTC
            </span>
            <span className={`absolute bottom-2 left-5 ${mono} text-[10px] tracking-[0.14em] text-faint`}>ANY COIN + ONE CIRCUIT</span>
            <div className="max-w-full overflow-hidden">
              <div className="hidden sm:block">
                <AsciiCoin cols={66} rows={34} size={11} />
              </div>
              <div className="sm:hidden">
                <AsciiCoin cols={66} rows={34} size={7} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center border-y border-[#1d1f23] bg-[#0d0e10] py-3.5">
        <span className={`mr-[18px] shrink-0 border-r border-[#1d1f23] pl-6 pr-[18px] ${mono} text-[11px] tracking-[0.14em] text-signal`}>LIVE RUNS</span>
        <div className="min-w-0 flex-1">
          <Ticker />
        </div>
      </div>

      <HomeLego />
      <HomeDescribe />

      {/* MODULES */}
      <section className={section}>
        <div className="mx-auto max-w-[1240px]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className={h2}>Anything can become a block.</h2>
            <Link href="/modules" className={`${secondary} h-[42px] px-[18px] text-[14.5px]`}>
              Explore modules
            </Link>
          </div>
          <div className="mt-12 grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-px overflow-hidden rounded-[14px] border border-[#23252a] bg-[#23252a]">
            {MODULE_CARDS.map((m) => {
              const hue = CATEGORIES.find((c) => c.code === m.code)?.hue ?? null;
              return (
                <div key={m.name} className="flex min-h-[240px] flex-col gap-4 bg-[#0f1012] p-5">
                  <div className="flex items-center justify-between">
                    <span className={`${mono} text-[12px] font-semibold tracking-[0.14em]`}>{m.name.toUpperCase()}</span>
                    <span className={`${mono} rounded-[3px] border px-1 text-[9.5px]`} style={{ color: hueColour(hue), borderColor: hueColour(hue, 0.5, 0.06) }}>
                      {m.code}
                    </span>
                  </div>
                  <pre className={`m-0 flex-1 ${mono} text-[11px] leading-[1.25] text-dim`}>{m.art}</pre>
                  <div className="flex flex-wrap gap-1.5">
                    {m.items.map((it) => (
                      <span key={it} className="whitespace-nowrap rounded-md border border-line-2 bg-[#1a1c20] px-2.5 py-[5px] text-[13px]">
                        {it}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            <Link href="/modules" className="flex min-h-[180px] flex-col justify-between bg-[#0f1012] p-5 text-fg hover:bg-[#141518] hover:text-fg">
              <span className={`${mono} text-[12px] font-semibold tracking-[0.14em] text-muted`}>YOUR MODULE</span>
              <span className="rounded-lg border border-dashed border-signal/60 p-3.5 text-[16px] text-[oklch(0.88_0.13_80)]">Build a block →</span>
            </Link>
          </div>
        </div>
      </section>

      {/* LAUNCH vs RUNTIME */}
      <section className={section}>
        <div className="mx-auto max-w-[1240px]">
          <h2 className={h2}>Built at birth. Programmable forever.</h2>
          <div className="mt-12 flex flex-wrap items-stretch gap-3">
            <div className="flex-[1_1_280px] rounded-[14px] border border-[#23252a] bg-panel p-[22px]">
              <div className={`flex justify-between ${mono} text-[11px] tracking-[0.12em]`}>
                <span>LAUNCH CONFIG</span>
                <span className="text-dim">SET ONCE</span>
              </div>
              <div className="mt-5 flex flex-col gap-1.5">
                {["Token", "Fee destination", "Project treasury"].map((t) => (
                  <div key={t} className="flex items-center gap-2.5 rounded-lg border border-[#2a2d33] bg-raised px-3 py-[11px] text-[14.5px]">
                    <span className="h-1.5 w-1.5 rounded-[1px] bg-dim" />
                    {t}
                  </div>
                ))}
                <div className="flex items-center gap-2.5 rounded-lg border border-signal/45 bg-raised px-3 py-[11px] text-[14.5px]">
                  <span className="h-1.5 w-1.5 rounded-[3px] bg-signal" />
                  Initial Circuit
                </div>
              </div>
            </div>
            <div className={`flex flex-none items-center justify-center px-1.5 ${mono} text-[18px] text-signal`}>→</div>
            <div className="flex-[1_1_280px] rounded-[14px] border border-[#23252a] bg-panel p-[22px]">
              <div className={`flex justify-between ${mono} text-[11px] tracking-[0.12em]`}>
                <span>RUNTIME CIRCUIT</span>
                <span className="text-ok">EDITABLE</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-1.5">
                {["Events", "Logic", "Actions", "State"].map((t) => (
                  <div key={t} className="rounded-lg border border-[#2a2d33] bg-raised px-3 py-[22px] text-[14.5px]">
                    {t}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-[1_1_280px] flex-col gap-[18px] rounded-[14px] border border-dashed border-[#34363c] p-[22px]">
              <div className="text-[18px] font-medium">Connect an existing token</div>
              <div>
                <div className={`${mono} text-[10.5px] tracking-[0.12em] text-muted`}>CAN MONITOR</div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {["trades", "wallet activity", "volume", "holders"].map((t) => (
                    <span key={t} className="rounded-md border border-line-2 px-2.5 py-[5px] text-[13px]">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <div className={`${mono} text-[10.5px] tracking-[0.12em] text-muted`}>CAN EXECUTE USING</div>
                <div className="mt-2.5 text-[14.5px]">A separately funded project budget</div>
              </div>
            </div>
          </div>
          <p className="mt-7 max-w-[640px] text-[18px] leading-normal text-fg-2 text-pretty">
            Some token mechanics are established when a project launches. CIRCUIT handles those separately from the behavior you can program afterward.
          </p>
        </div>
      </section>

      <HomeDebug />

      {/* IDEA TO PROGRAM */}
      <section className={section}>
        <div className="mx-auto max-w-[1240px]">
          <h2 className={h2}>From idea to program.</h2>
          <div className="mt-12 grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3">
            <div className="flex min-h-[320px] flex-col gap-5 rounded-[14px] border border-[#23252a] bg-panel p-6">
              <span className={`${mono} text-[12px] tracking-[0.14em]`}>DESCRIBE</span>
              <div className="flex-1 rounded-[10px] border border-line-2 bg-canvas p-4 text-[16px] leading-normal text-[#c9c7c2]">
                “I want every 100 holders to…
                <span className="ml-0.5 inline-block h-4 w-0.5 animate-[cxBlink_1s_steps(1)_infinite] bg-signal align-[-2px]" />
              </div>
              <span className="text-[15px] text-fg-2">→ AI builds the Circuit.</span>
            </div>
            <div className="flex min-h-[320px] flex-col gap-5 rounded-[14px] border border-[#23252a] bg-panel p-6">
              <span className={`${mono} text-[12px] tracking-[0.14em]`}>BUILD</span>
              <div className="flex-1 overflow-hidden rounded-[10px] border border-line-2 p-4" style={{ backgroundColor: "#0e0f11", backgroundImage: "radial-gradient(circle,#ffffff10 1px,transparent 1.3px)", backgroundSize: "16px 16px" }}>
                <StaticBlocks program={TINY} zoom={0.72} />
              </div>
              <span className="text-[15px] text-fg-2">Drag blocks yourself.</span>
            </div>
            <div className="flex min-h-[320px] flex-col gap-5 rounded-[14px] border border-[#23252a] bg-panel p-6">
              <span className={`${mono} text-[12px] tracking-[0.14em]`}>REMIX</span>
              <div className="flex flex-1 flex-col gap-2">
                <div className="rounded-[10px] border border-line-2 bg-raised p-3.5">
                  <div className={`${mono} text-[12px] text-muted`}>@harbor / living-crew</div>
                  <div className={`mt-2.5 flex gap-3.5 ${mono} text-[11.5px] text-dim`}>
                    <span>5 blocks</span>
                    <span>212 remixes</span>
                  </div>
                </div>
                <div className="ml-5 h-4 w-px bg-[#3a3d43]" />
                <div className="rounded-[10px] border border-signal/50 bg-raised p-3.5">
                  <div className={`${mono} text-[12px] text-[oklch(0.88_0.13_80)]`}>you / living-crew-remix</div>
                  <div className="mt-2 text-[13px] text-fg-2">+ IF agent.species = owl → ASK AI</div>
                </div>
              </div>
              <span className="text-[15px] text-fg-2">Open another public Circuit and modify it.</span>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-6 pb-[120px] pt-6">
        <div
          className="relative mx-auto flex min-h-[620px] max-w-[1240px] flex-col items-center justify-center gap-14 overflow-hidden rounded-[18px] border border-[#23252a] px-6 py-20"
          style={{ backgroundColor: "#0b0c0d", backgroundImage: "radial-gradient(circle,#ffffff12 1px,transparent 1.3px)", backgroundSize: "22px 22px" }}
        >
          <StaticBlocks program={BLANK} zoom={1.5} />
          <div className="text-center">
            <h2 className="m-0 text-[clamp(44px,7vw,104px)] font-semibold uppercase leading-[0.9] tracking-[-0.055em]">
              What should
              <br />
              <span className="text-signal">happen next?</span>
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-2.5">
              <Link href="/build?template=blank" className={`${primary} h-[46px] px-5 text-[15px]`}>
                Start building
              </Link>
              <a href="#describe" className={`${secondary} h-[46px] px-5 text-[15px]`}>
                Describe your idea
              </a>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
