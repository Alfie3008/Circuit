"use client";

import { useState } from "react";

const EXAMPLES = [
  "Every 5 SOL of volume, create a random animal agent. Give it a funny AI-generated identity and add it to my website.",
  "Whenever the treasury receives 0.1 SOL, wake an explorer agent and have it save a new web finding.",
  "Every hour, randomly select one existing agent and have AI generate a diary entry.",
  "When holder count reaches 1,000, generate a collectible and add it to the project gallery.",
  "When someone submits work to a bounty, have AI score it. If the score is above 80, approve it.",
];

/** Build with AI. The compiler (NL → Circuit IR → blocks) is wired up in Phase 5. */
export function PromptBar() {
  const [prompt, setPrompt] = useState("");

  return (
    <section className="border-b border-line bg-panel/60 px-4 py-3">
      <div className="flex gap-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="Describe what you want your project to do…"
          className="min-h-[52px] flex-1 resize-none rounded-lg border border-line bg-ink px-3 py-2 text-[15px] text-fg placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <div className="flex flex-col items-stretch justify-center gap-1">
          <button
            disabled
            title="The AI compiler arrives in Phase 5"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Build with AI
          </button>
          <span className="text-center text-[11px] text-muted">Phase 5</span>
        </div>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,black_92%,transparent)] [scrollbar-width:none]">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => setPrompt(ex)}
            title={ex}
            className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-fg"
          >
            {ex.length > 56 ? `${ex.slice(0, 54)}…` : ex}
          </button>
        ))}
      </div>
    </section>
  );
}
