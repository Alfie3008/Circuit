"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { StaticBlocks } from "@/components/blocks/StaticBlocks";
import { DIARY, DIARY_PROMPT } from "@/lib/marketing/demos";

/** "Or describe it": the program assembles itself when the section scrolls into view. */
export function HomeDescribe() {
  const section = useRef<HTMLElement>(null);
  const [total, setTotal] = useState(0);
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<"idle" | "build" | "ready">("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const build = useCallback(() => {
    if (!total) return;
    timers.current.forEach(clearTimeout);
    setPhase("build");
    setShown(0);
    for (let i = 1; i <= total; i++) timers.current.push(setTimeout(() => setShown(i), 400 + i * 300));
    timers.current.push(setTimeout(() => setPhase("ready"), 600 + total * 300));
  }, [total]);

  useEffect(() => {
    const el = section.current;
    if (!el || !total || phase !== "idle") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          io.disconnect();
          build();
        }
      },
      { rootMargin: "0px 0px -30% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [total, phase, build]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const status = phase === "build" ? `Assembling · ${shown} / ${total} blocks` : phase === "ready" ? `${total} blocks · 2 stacks · ready to edit` : "";

  return (
    <section ref={section} id="describe" className="border-t border-[#17191c] px-6 py-[120px]">
      <div className="mx-auto max-w-[1240px]">
        <h2 className="mt-2.5 text-[clamp(36px,5.4vw,72px)] font-medium leading-none tracking-[-0.045em]">Or describe it.</h2>
        <div className="mt-10 rounded-[14px] border border-line-2 bg-panel px-7 pb-[22px] pt-7">
          <div className="text-[clamp(20px,2.4vw,30px)] leading-[1.35] tracking-[-0.02em] text-fg text-pretty">“{DIARY_PROMPT}”</div>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <button onClick={build} className="h-[42px] cursor-pointer rounded-lg border-none bg-signal px-[18px] text-[14.5px] font-medium text-signal-ink hover:brightness-[1.08]">
              Build with AI
            </button>
            <Link href="/build" className="inline-flex h-[42px] items-center whitespace-nowrap rounded-lg border border-[#34363c] px-[18px] text-[14.5px] text-fg hover:bg-white/[0.04] hover:text-fg">
              Edit blocks
            </Link>
            <span className="ml-1.5 font-mono text-[11.5px] text-muted">{status}</span>
          </div>
        </div>
        <div className="dot-canvas mt-3 min-h-[420px] overflow-auto rounded-[14px] border border-[#23252a] p-10">
          <StaticBlocks program={DIARY} layout="row" gap={56} visible={phase === "idle" ? 0 : shown} onReady={setTotal} />
        </div>
        <p className="mt-6 max-w-[560px] text-[18px] leading-normal text-fg-2">Circuit translates your idea into real blocks. You own the logic. Change anything.</p>
      </div>
    </section>
  );
}
