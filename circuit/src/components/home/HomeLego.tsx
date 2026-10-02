"use client";

import { useEffect, useState } from "react";
import { StaticBlocks } from "@/components/blocks/StaticBlocks";
import { LEGO, LEGO_STEPS } from "@/lib/marketing/demos";

/** Five steps, then two beats showing the finished program. */
const BEATS = LEGO_STEPS.length + 2;

export function HomeLego() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % BEATS), 1500);
    return () => clearInterval(id);
  }, []);
  const current = LEGO_STEPS[step];

  return (
    <section className="border-t border-[#17191c] px-6 py-[120px]">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-14">
        <div className="min-w-0 flex-[1_1_340px]">
          <h2 className="mt-2.5 text-[clamp(36px,5.4vw,72px)] font-medium leading-none tracking-[-0.045em]">Build it like Lego.</h2>
          <p className="mt-6 max-w-[440px] text-[18px] leading-normal text-fg-2 text-pretty">
            Triggers. Conditions. Variables. Agents. APIs. Whatever comes next. Snap them together.
          </p>
          <div className="mt-9 flex flex-col gap-0.5">
            {LEGO_STEPS.map((s, i) => (
              <div
                key={s.text}
                className="flex items-center gap-3.5 border-t border-[#1d1f23] py-2.5 transition-colors duration-[250ms]"
                style={{ color: i === step ? "#f3efe6" : i < step ? "#8b8d93" : "#55585e" }}
              >
                <span className="w-[22px] font-mono text-[11px]" style={{ color: i === step ? "var(--color-signal)" : i < step ? "var(--color-ok)" : "#44474d" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[15px]">{s.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="dot-canvas min-h-[460px] min-w-0 flex-[1.2_1_460px] overflow-auto rounded-[14px] border border-[#23252a] p-10">
          <StaticBlocks program={LEGO} hidden={current?.hidden ?? []} target={current?.target ?? null} />
        </div>
      </div>
    </section>
  );
}
