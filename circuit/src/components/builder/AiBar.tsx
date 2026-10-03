"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { aiPost, errorText } from "@/lib/ai/client";
import { EXAMPLE_PROMPTS } from "@/lib/ai/examples";
import type { Program } from "@/lib/ir";
import { useBuilderUi } from "@/store/builderUi";
import { useProjectStore } from "@/store/project";
import { useRuntimeStore } from "@/store/runtime";

/** "Every 5 SOL of volume, create…" → "Every 5 SOL of volume create" */
const nameFrom = (prompt: string) => {
  const words = prompt.replace(/[^\w\s]/g, "").trim().split(/\s+/).slice(0, 6).join(" ");
  return words || "AI program";
};

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** The top-bar button that opens Build with AI (also ⌘K / Ctrl+K). */
export function AiButton() {
  const setAi = useBuilderUi((s) => s.setAi);
  const [mac, setMac] = useState(true);
  useEffect(() => {
    const first = setTimeout(() => setMac(isMac()), 0);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAi(!useBuilderUi.getState().aiOpen);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(first);
      document.removeEventListener("keydown", onKey);
    };
  }, [setAi]);
  return (
    <button
      onClick={() => setAi(true)}
      className="flex h-8 w-[min(420px,100%)] cursor-pointer items-center gap-2.5 rounded-[7px] border border-line-2 bg-[#141518] px-3 text-left text-[13px] text-muted transition-colors hover:border-[#3a3d43] hover:text-[#c9c7c2]"
    >
      <span className="rounded-[3px] border border-signal/50 px-1 font-mono text-[10px] text-signal">AI</span>
      <span className="flex-1 truncate">Describe what you want… Circuit builds the blocks</span>
      <span className="font-mono text-[10.5px] text-faint">{mac ? "⌘K" : "Ctrl K"}</span>
    </button>
  );
}

/**
 * Build with AI: describe a program, get editable blocks. The server compiles
 * with Claude when it has a key; otherwise the example prompts still work
 * from hand-written programs. Opens over the canvas.
 */
export function AiPanel() {
  const open = useBuilderUi((s) => s.aiOpen);
  const setAi = useBuilderUi((s) => s.setAi);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const ai = useRuntimeStore((s) => s.aiStatus);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => box.current?.focus());
  }, [open]);

  const build = async (text = prompt) => {
    const request = text.trim();
    if (!request || busy) return;
    const { notify, openProgram } = useProjectStore.getState();
    setBusy(true);
    try {
      const res = await aiPost("/api/compile", { prompt: request }, true);
      if (!res.ok) return notify("error", await errorText(res));
      const body = (await res.json()) as { program: Program; explanation: string; source: "claude" | "offline"; model?: string };
      if (!openProgram(nameFrom(request), body.program)) return;
      const how = body.source === "claude" ? `Built by ${body.model}.` : "Built from a saved example (no API key set, so this is the offline demo).";
      notify("info", `${body.explanation}\n${how} Edit anything.`);
      setPrompt("");
      setAi(false);
    } catch (e) {
      notify("error", `Build with AI failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute left-1/2 top-4 z-[60] w-[min(620px,calc(100%-32px))] -translate-x-1/2 rounded-xl border border-[#34373d] bg-[#141518] p-3.5 shadow-[0_24px_60px_-12px_#000c]"
      role="dialog"
      aria-label="Build with AI"
    >
      <div className="mb-2.5 flex justify-between font-mono text-[10.5px] tracking-[0.12em] text-muted">
        <span>DESCRIBE WHAT YOU WANT</span>
        <span className={ai?.enabled ? "text-ok" : ""} title={ai?.enabled ? `Compiles with ${ai.compileModel}` : "No API key on the server: the suggestions below work offline."}>
          {ai?.enabled ? "AI WRITES BLOCKS · YOU EDIT THEM" : "OFFLINE · SUGGESTIONS WORK WITHOUT A KEY"}
        </span>
      </div>
      <textarea
        ref={box}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAi(false);
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void build();
        }}
        rows={3}
        maxLength={2000}
        disabled={busy}
        placeholder="When someone buys more than 5 SOL, create an AI character…"
        className="w-full resize-none rounded-lg border border-line-2 bg-canvas p-3 font-sans text-[15px] leading-normal text-fg placeholder:text-faint focus:border-signal/50 focus:outline-none disabled:opacity-60"
      />
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {EXAMPLE_PROMPTS.slice(0, 3).map((ex) => (
          <button
            key={ex}
            onClick={() => setPrompt(ex)}
            title={ex}
            className="max-w-[180px] cursor-pointer truncate rounded-md border border-line-2 px-[9px] py-[5px] text-[12px] text-fg-2 hover:border-[#44474d] hover:text-fg"
          >
            {ex}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={() => setAi(false)} className="h-8 cursor-pointer rounded-[7px] border border-line-2 px-3 text-[13px] text-fg-2 hover:text-fg">
          Cancel
        </button>
        <button
          onClick={() => void build()}
          disabled={busy || !prompt.trim()}
          className="h-8 cursor-pointer rounded-[7px] bg-signal px-3.5 text-[13px] font-medium text-signal-ink hover:brightness-[1.08] disabled:opacity-50"
        >
          {busy ? "Building…" : "Build with AI"}
        </button>
      </div>
    </motion.div>
  );
}
