"use client";

import { useEffect, useRef, useState } from "react";
import { aiPost, errorText } from "@/lib/ai/client";
import { EXAMPLE_PROMPTS } from "@/lib/ai/examples";
import type { Program } from "@/lib/ir";
import { useProjectStore } from "@/store/project";
import { useRuntimeStore } from "@/store/runtime";

/** "Every 5 SOL of volume, create…" → "Every 5 SOL of volume create" */
const nameFrom = (prompt: string) => {
  const words = prompt.replace(/[^\w\s]/g, "").trim().split(/\s+/).slice(0, 6).join(" ");
  return words || "AI program";
};

/**
 * Build with AI: describe a program, get editable blocks. The server compiles
 * with Claude when it has a key; otherwise the example prompts still work
 * from hand-written programs.
 */
export function AiBar() {
  const [prompt, setPrompt] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ai = useRuntimeStore((s) => s.aiStatus);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const build = async (text = prompt) => {
    const request = text.trim();
    if (!request || busy) return;
    const { notify, openProgram } = useProjectStore.getState();
    setBusy(true);
    setOpen(false);
    try {
      const res = await aiPost("/api/compile", { prompt: request }, true);
      if (!res.ok) return notify("error", await errorText(res));
      const body = (await res.json()) as { program: Program; explanation: string; source: "claude" | "offline"; model?: string };
      openProgram(nameFrom(request), body.program);
      const how = body.source === "claude" ? `Built by ${body.model}.` : "Built from a saved example (no API key set, so this is the offline demo).";
      notify("info", `${body.explanation}\n${how} Edit anything.`);
      setPrompt("");
    } catch (e) {
      notify("error", `Build with AI failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const mode = ai?.enabled ? "CLAUDE" : "OFFLINE";
  const modeTitle = ai?.enabled
    ? `Compiles with ${ai.compileModel}; AI blocks use ${ai.runtimeModel}.`
    : "No API key on the server: the example prompts work offline, AI blocks give mock answers.";

  return (
    <div ref={root} className="relative min-w-0">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void build();
        }}
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
          disabled={busy}
          maxLength={2000}
          placeholder={busy ? "Building your program…" : "Describe what you want…"}
          aria-label="Describe what you want your project to do"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-fg placeholder:text-dim focus:outline-none disabled:opacity-60"
        />
        {busy ? (
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-signal" aria-label="Building" />
        ) : (
          <span title={modeTitle} className={`hidden shrink-0 font-mono text-[10.5px] tracking-[0.06em] md:inline ${ai?.enabled ? "text-ok" : "text-faint"}`}>
            {mode}
          </span>
        )}
      </form>

      {open && !busy && (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 rounded-lg border border-line-2 bg-panel p-1 shadow-2xl shadow-black/60">
          <p className="px-2.5 pb-1 pt-1.5 font-mono text-[10.5px] tracking-[0.12em] text-dim">
            TRY{ai?.enabled ? "" : " · THESE WORK OFFLINE"} · ENTER TO BUILD
          </p>
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setPrompt(ex);
                void build(ex);
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
