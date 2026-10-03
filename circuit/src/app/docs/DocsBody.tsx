"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FuelMeter } from "@/components/proof/FuelMeter";
import { ProofModal, type ProofView } from "@/components/proof/ProofModal";
import { Receipt } from "@/components/proof/Receipt";
import { WatchRun } from "@/components/proof/WatchRun";
import { Words } from "@/components/runtime/Words";
import { explainProgram } from "@/lib/explain/explain";
import { FUEL_SHARE } from "@/lib/fuel";
import { getTemplate } from "@/lib/templates";

const TOC: [string, string][] = [
  ["receipts", "Receipts"],
  ["sources", "Live or simulated"],
  ["verify", "Checking on Solana"],
  ["rules", "Rules and versions"],
  ["english", "Plain English"],
  ["golive", "Going live"],
  ["fuel", "AI fuel"],
  ["pages", "Public pages"],
];

const GO_LIVE: [string, string][] = [
  ["Connect the coin", "Paste the mint address and sign in with the wallet that created it. Circuit checks on Solana that it did. Signing in is free and moves no SOL."],
  ["AI fuel", `Nothing to set. Your coin pays for its own AI: up to ${FUEL_SHARE * 100}% of the creator fees it earns after going live. The rest is never touched.`],
  ["Review", "Read the plain-English rules one more time."],
  ["Publish", "Your page goes live, then your wallet writes the rules' fingerprint to Solana in one small transaction (about 0.000005 SOL)."],
  ["Choose the page layout", "World, Gallery, Feed or Website. You can change it later."],
];

const n2 = (i: number) => String(i + 1).padStart(2, "0");
const eyebrow = "font-mono text-[11.5px] tracking-[0.14em] text-dim";
const h2 = "m-0 text-[36px] font-medium leading-[1.05] tracking-[-0.035em]";
const body = "m-0 text-[16px] leading-[1.6] text-fg-2 text-pretty";
const verifyBtn =
  "self-start h-[42px] cursor-pointer rounded-lg border border-ok/50 bg-ok/[0.08] px-4 font-mono text-[12.5px] text-[oklch(0.86_0.11_155)] hover:bg-ok/[0.16]";

function Eyebrow({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className={eyebrow}>
      <span className="text-signal">{String(n).padStart(2, "0")}</span> · {children}
    </div>
  );
}

export function DocsBody() {
  const [modal, setModal] = useState<ProofView | null>(null);
  const [fuel, setFuel] = useState<"healthy" | "low" | "empty">("healthy");
  const crew = getTemplate("living-crew")!;
  const rules = useMemo(() => explainProgram(crew.program), [crew.program]);

  return (
    <div className="mx-auto flex max-w-[1240px] flex-wrap items-start gap-14 px-6 pb-[120px] pt-14">
      <aside className="sticky top-24 hidden flex-[0_0_220px] flex-col gap-0.5 text-[14px] lg:flex">
        <div className="mb-2.5 font-mono text-[10.5px] tracking-[0.14em] text-dim">PROOF</div>
        {TOC.map(([id, label], i) => (
          <a key={id} href={`#${id}`} className="flex gap-2.5 py-1.5 text-fg-2 hover:text-signal">
            <span className="w-[18px] font-mono text-[11px] text-faint">{n2(i)}</span>
            {label}
          </a>
        ))}
      </aside>

      <main className="flex min-w-0 max-w-[780px] flex-[1_1_560px] flex-col gap-[88px]">
        <div>
          <div className={eyebrow}>
            <span className="text-signal">04</span> · DOCS · PROOF
          </div>
          <h1 className="mt-3 text-[clamp(44px,6vw,84px)] font-semibold uppercase leading-[0.9] tracking-[-0.05em]">
            How Circuit
            <br />
            <span className="text-signal">proves it.</span>
          </h1>
          <p className="mt-6 text-[18px] leading-[1.55] text-fg-2 text-pretty">
            A coin&apos;s program runs on Circuit&apos;s servers. Everything it does leaves a receipt, every receipt carries its source, and the rules and receipts are
            fingerprinted on Solana so holders don&apos;t have to take anyone&apos;s word for it.
          </p>
        </div>

        <section id="receipts" className="flex scroll-mt-24 flex-col gap-5">
          <Eyebrow n={1}>RECEIPTS</Eyebrow>
          <h2 className={h2}>Every run leaves a receipt.</h2>
          <p className={body}>
            A receipt has three parts. At the top is what caused the run: the trade, the wallet, and the transaction on Solscan. In the middle are the steps the program
            took, in order, with the values it used. At the bottom are the program&apos;s fingerprint, the receipt&apos;s fingerprint, and the Solana transaction it was
            written in.
          </p>
          <Receipt onVerify={() => setModal({ type: "verify", kind: "receipt" })} />
          <p className={`${body} mt-3`}>
            Here is one run from start to finish: a real trade arrives, the rule it matches lights up, the effects appear, and the receipt settles and is written to
            Solana.
          </p>
          <WatchRun onVerify={() => setModal({ type: "verify", kind: "receipt" })} />
        </section>

        <section id="sources" className="flex scroll-mt-24 flex-col gap-5">
          <Eyebrow n={2}>SOURCES</Eyebrow>
          <h2 className={h2}>Live or simulated.</h2>
          <p className={body}>Every event, receipt and money figure is labelled with where it came from. A simulated run never looks like a real one.</p>
          <div className="flex flex-col border-t border-[#1f2125]">
            {[
              ["● LIVE · SOLANA", "text-ok", "Caused by a real transaction. Links to Solscan. Receipts are written to Solana."],
              ["● SIMULATED", "text-signal", "Sent from the simulator in the builder. No transaction, no Solscan link, nothing written on chain. All purchases a program makes are simulated at launch."],
            ].map(([tag, tone, text]) => (
              <div key={tag} className="flex flex-wrap items-baseline gap-4 border-b border-[#1f2125] py-3.5">
                <span className={`w-[130px] font-mono text-[11px] tracking-[0.1em] ${tone}`}>{tag}</span>
                <span className="flex-[1_1_300px] text-[15px] leading-normal">{text}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="verify" className="flex scroll-mt-24 flex-col gap-5">
          <Eyebrow n={3}>CHECKING ON SOLANA</Eyebrow>
          <h2 className={h2}>Check a receipt yourself.</h2>
          <p className={body}>
            Each receipt is turned into a short fingerprint (a SHA-256 hash). Every few minutes Circuit collects the new fingerprints into a batch and writes the
            batch&apos;s root to Solana in a single transaction. Pressing Verify recomputes the fingerprint in your browser, fetches that transaction, and checks the receipt
            is part of the batch.
          </p>
          <div className="flex flex-col gap-2">
            {["Read the receipt and work out its fingerprint.", "Find the batch transaction on Solana.", "Check the fingerprint is in that batch.", "Check it ran with the published rules."].map(
              (t, i) => (
                <div key={t} className="flex gap-3.5 text-[15px] leading-normal">
                  <span className="w-[22px] pt-0.5 font-mono text-[11.5px] text-ok">{n2(i)}</span>
                  {t}
                </div>
              ),
            )}
          </div>
          <p className="m-0 text-[14px] leading-[1.6] text-dim">A receipt shows “anchoring in the next batch” until its batch is written, usually within 3 minutes.</p>
          <button onClick={() => setModal({ type: "verify", kind: "receipt" })} className={verifyBtn}>
            ✓ Try it on receipt 9b27…e4d1
          </button>
        </section>

        <section id="rules" className="flex scroll-mt-24 flex-col gap-5">
          <Eyebrow n={4}>RULES AND VERSIONS</Eyebrow>
          <h2 className={h2}>The rules can&apos;t change quietly.</h2>
          <p className={body}>
            When a creator publishes, the program&apos;s fingerprint is written to Solana from the creator&apos;s wallet. Editing the program later publishes a new version
            with a new fingerprint. The coin&apos;s page shows the current version, the date it was published, and every earlier version.
          </p>
          <div className="flex flex-col rounded-xl border border-[#1f2125] bg-panel px-[18px] py-1 font-mono text-[12px]">
            {[
              ["v3 · a3f9c1e0", "Sep 28 · added NVDA, TSLA, AAPL", true],
              ["v2 · 71be04d2", "Sep 21 · 0.05 → 0.03 SOL per buy", false],
              ["v1 · 0c5d9a17", "Sep 14 · first publish", false],
            ].map(([v, note, current], i, arr) => (
              <div key={String(v)} className={`flex justify-between gap-3 py-2.5 ${i < arr.length - 1 ? "border-b border-[#1d1f23]" : ""} ${current ? "" : "text-fg-2"}`}>
                <span>{v}</span>
                <span className="text-fg-2">{note}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setModal({ type: "verify", kind: "rules" })} className={verifyBtn}>
            ✓ Check Living Crew&apos;s rules
          </button>
        </section>

        <section id="english" className="flex scroll-mt-24 flex-col gap-5">
          <Eyebrow n={5}>PLAIN ENGLISH</Eyebrow>
          <h2 className={h2}>Rules holders can read.</h2>
          <p className={body}>
            Circuit writes the program out as sentences, straight from the blocks. Creators can&apos;t edit the text, so it always matches what runs. In the builder,
            press Explain and hover a sentence to find its block.
          </p>
          <div className="rounded-xl border border-[#23252a] bg-panel px-5 py-[18px]">
            {rules.map((s, i) => (
              <div key={i}>
                <p className="m-0 text-[19px] font-medium leading-[1.55]">
                  <Words parts={s.title} />
                </p>
                {s.lines.map((l, j) => (
                  <p key={j} className="m-0 text-[17px] leading-[1.6] text-fg-2" style={{ paddingLeft: 16 + l.depth * 18 }}>
                    <Words parts={l.parts} />
                  </p>
                ))}
              </div>
            ))}
          </div>
          <Link href="/build?template=living-crew" className="self-start border-b border-[#3a3d43] font-mono text-[12.5px] text-fg hover:text-signal">
            Open it in the builder →
          </Link>
        </section>

        <section id="golive" className="flex scroll-mt-24 flex-col gap-5">
          <Eyebrow n={6}>GOING LIVE</Eyebrow>
          <h2 className={h2}>From simulator to a real coin.</h2>
          <div className="flex flex-col border-t border-[#1f2125]">
            {GO_LIVE.map(([t, d], i) => (
              <div key={t} className="flex gap-4 border-b border-[#1f2125] py-3.5">
                <span className="w-[22px] pt-[3px] font-mono text-[11.5px] text-signal">{n2(i)}</span>
                <div className="flex-1">
                  <div className="text-[16px] font-medium">{t}</div>
                  <div className="mt-[3px] text-[14.5px] leading-[1.55] text-fg-2 text-pretty">{d}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-[10px] border border-signal/40 bg-signal/[0.06] px-4 py-3.5 text-[14.5px] leading-[1.55]">
            Creator-fee routing depends on the token&apos;s existing configuration and is not automatically changed by Circuit. Trades and purchases a program makes are
            simulated at launch.
          </div>
        </section>

        <section id="fuel" className="flex scroll-mt-24 flex-col gap-5">
          <Eyebrow n={7}>AI FUEL</Eyebrow>
          <h2 className={h2}>The coin pays for its own AI.</h2>
          <p className={body}>
            AI blocks (names, personalities, posts, decisions) cost a fraction of a cent each time they run. There is no budget to pick: every trade of the coin earns
            creator fees, and up to {FUEL_SHARE * 100}% of the fees earned since going live can be spent on AI. The rest is never touched. A coin with a few thousand
            dollars of trading a day earns far more fuel than its AI uses. If it ever runs out, AI blocks use simple fallbacks such as default names until the next
            trades refill it. Nothing else stops.
          </p>
          <div className="flex gap-0.5 self-start rounded-lg border border-[#23252a] bg-canvas p-[3px]">
            {(["healthy", "low", "empty"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFuel(k)}
                className="h-7 cursor-pointer rounded-md px-3 font-mono text-[11.5px] capitalize"
                style={{ background: k === fuel ? "#22252a" : "transparent", color: k === fuel ? "#e8e6e1" : "#6d7076" }}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="max-w-[400px]">
            <FuelMeter state={fuel} />
          </div>
        </section>

        <section id="pages" className="flex scroll-mt-24 flex-col gap-5">
          <Eyebrow n={8}>PUBLIC PAGES</Eyebrow>
          <h2 className={h2}>One page per coin.</h2>
          <p className={body}>
            Every live coin gets circuit.app/p/your-coin. The identity, rules, proof and activity always sit in the same place. The creator picks how the world is shown:
            World (agents as cards), Gallery (images and collectibles), Feed (posts) or Website (key values as a mini homepage). The page also shows its state honestly:
            waiting for the first trade, simulation only, AI paused, or stopped by an error.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/build" className="inline-flex h-[38px] items-center rounded-lg bg-signal px-3.5 text-[14px] font-medium text-signal-ink hover:text-signal-ink hover:brightness-[1.08]">
              Publish one from the builder →
            </Link>
          </div>
        </section>
      </main>
      <ProofModal view={modal} onClose={() => setModal(null)} example />
    </div>
  );
}
