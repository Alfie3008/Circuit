"use client";

import { useEffect, useRef, useState } from "react";

const EXAMPLES = [
  "Every 5 SOL of volume, create a random animal agent. Give it a funny AI-generated identity and add it to my website.",
  "Whenever the treasury receives 0.1 SOL, wake an explorer agent and have it save a new web finding.",
  "Every hour, randomly select one existing agent and have AI generate a diary entry.",
  "When holder count reaches 1,000, generate a collectible and add it to the project gallery.",
  "When someone submits work to a bounty, have AI score it. If the score is above 80, approve it.",
];

/** Build with AI, centred in the header. The compiler (NL → Circuit IR → blocks) is wired up in Phase 5. */
export function AiBar() {
  const [prompt, setPrompt] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={root} className="relative min-w-0">
      <form
        onSubmit={(e) => e.preventDefault()}
        className="flex h-[34px] items-center gap-2.5 rounded-lg border border-line-2 bg-panel pl-1.5 pr-2 transition-colors focus-within:border-signal/55"
      >
        <span className="shrink-0 rounded-[5px] border border-signal/55 bg-signal/10 px-1.5 font-mono text-[10.5px] leading-[18px] tracking-[0.06em] text-[oklch(0.88_0.13_80)]">
          AI
        </span>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && (setOpen(false), e.currentTarget.blur())}
          placeholder="Describe what you want…"
          aria-label="Describe what you want your project to do"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-fg placeholder:text-dim focus:outline-none"
        />
        <span className="hidden shrink-0 font-mono text-[10.5px] tracking-[0.06em] text-faint md:inline" title="Build with AI arrives in Phase 5">
          PHASE 5
        </span>
      </form>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 rounded-lg border border-line-2 bg-panel p-1 shadow-2xl shadow-black/60">
          <p className="px-2.5 pb-1 pt-1.5 font-mono text-[10.5px] tracking-[0.12em] text-dim">TRY</p>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setPrompt(ex);
                setOpen(false);
              }}
              className="block w-full truncate rounded-md px-2.5 py-1.5 text-left text-[13px] text-fg-2 hover:bg-white/5 hover:text-fg"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
