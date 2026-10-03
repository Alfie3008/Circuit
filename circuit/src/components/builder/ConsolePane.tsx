"use client";

import { useEffect, useRef, useState } from "react";
import { clock, kindOf, num, runNo, show } from "@/components/runtime/format";
import type { Receipt, RuntimeState } from "@/lib/runtime/state";
import { useRuntimeStore, type Speed } from "@/store/runtime";

const STATUS_TEXT: Record<Receipt["status"], string> = {
  running: "RUNNING",
  complete: "COMPLETE",
  error: "ERROR",
  stopped: "STOPPED",
  step_limit: "STEP LIMIT",
};
const statusColour = (s: Receipt["status"]) =>
  s === "complete" ? "text-ok" : s === "running" ? "text-signal" : s === "stopped" ? "text-muted" : "text-err";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const ctrl =
  "inline-flex h-6 items-center gap-1.5 rounded border border-line-2 px-2 text-[10.5px] tracking-[0.08em] text-fg-2 transition-colors hover:bg-white/5 hover:text-fg disabled:pointer-events-none disabled:opacity-30";

function Controls() {
  const { status, speed, pause, resume, step, stop, setSpeed } = useRuntimeStore();
  const dot = status === "running" ? "bg-signal animate-pulse" : status === "paused" ? "bg-signal" : "bg-[#3a3d43]";
  return (
    <div className="flex items-center gap-1.5">
      <span className="mr-2 flex items-center gap-1.5 text-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {status.toUpperCase()}
      </span>
      {status === "paused" ? (
        <button className={ctrl} onClick={resume} title="Resume">
          ▶ RESUME
        </button>
      ) : (
        <button className={ctrl} onClick={pause} disabled={status !== "running"} title="Pause">
          ❚❚ PAUSE
        </button>
      )}
      <button className={ctrl} onClick={step} disabled={status !== "paused"} title="Run the next block">
        STEP
      </button>
      <button className={ctrl} onClick={stop} disabled={status === "idle"} title="Stop and drop queued runs">
        ■ STOP
      </button>
      <select
        value={speed}
        onChange={(e) => setSpeed(e.target.value as Speed)}
        aria-label="Execution speed"
        className="h-6 rounded border border-line-2 bg-panel px-1.5 text-[10.5px] tracking-[0.08em] text-fg-2 focus:outline-none"
      >
        <option value="slow">SLOW</option>
        <option value="normal">NORMAL</option>
        <option value="fast">FAST</option>
        <option value="instant">INSTANT</option>
      </select>
    </div>
  );
}

function ConsoleLog({ state }: { state: RuntimeState }) {
  const end = useRef<HTMLDivElement>(null);
  const runs = state.runs.slice(-15);
  const lastLen = runs.length ? runs[runs.length - 1].entries.length : 0;
  // Braces matter: newer browsers return a Promise from scrollIntoView, and an
  // effect may only return a cleanup function.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [runs.length, lastLen]);

  if (!runs.length)
    return (
      <p className="flex gap-3 text-fg-2">
        <span className="text-faint">--:--:--</span>
        Idle · press Run to simulate an event
      </p>
    );
  return (
    <>
      {runs.map((r) => (
        <div key={r.id} className="mb-1.5">
          <p className="flex gap-3">
            <span className="shrink-0 text-faint">{clock(r.startedAt)}</span>
            <span className="shrink-0 text-dim">{runNo(r.id)}</span>
            <span className="text-fg">{r.event.label}</span>
            {r.event.proof && (
              <a href={r.event.proof.explorer} target="_blank" rel="noreferrer" className="shrink-0 text-ok hover:underline" title="Open the transaction on Solscan">
                LIVE ↗
              </a>
            )}
            <span className={`ml-auto shrink-0 ${statusColour(r.status)}`}>
              {STATUS_TEXT[r.status]} · {plural(r.status === "running" ? r.entries.length - 1 : r.steps, "step")}
            </span>
          </p>
          {r.entries.slice(1).map((e, i) => (
            <p key={i} className={`flex gap-3 pl-[74px] ${e.status === "error" ? "text-err" : e.status === "skipped" ? "text-dim" : "text-fg-2"}`}>
              <span className="shrink-0 text-faint">{String(i + 1).padStart(2, "0")}</span>
              <span>{e.text}</span>
              {e.simulated && <span className="shrink-0 text-[oklch(0.88_0.13_80)]/80">SIMULATED</span>}
            </p>
          ))}
        </div>
      ))}
      <div ref={end} />
    </>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1.5 text-[10.5px] tracking-[0.12em] text-dim">{children}</p>
);

function Debugger({ state }: { state: RuntimeState }) {
  const live = useRuntimeStore((s) => s.live);
  const debug = useRuntimeStore((s) => s.debug);
  const vars = Object.entries(state.variables).map(([k, v]) => [k, show(v, state), kindOf(v)] as const);
  // Flash variables that changed since the last snapshot ("previous render" state pattern).
  const [prev, setPrev] = useState(state);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  if (prev !== state) {
    setPrev(state);
    setChanged(new Set(vars.filter(([k, v]) => k in prev.variables && show(prev.variables[k], prev) !== v).map(([k]) => k)));
  }

  if (!live)
    return (
      <p className="text-fg-2">
        Not running.{" "}
        {debug
          ? "Press Run: execution will pause on the event block, then STEP runs one block at a time."
          : "Turn on Debug in the header to pause at every block, or press Run to watch it play."}
      </p>
    );

  const receipt = state.runs.find((r) => r.id === live.receiptId);
  const agent = live.focusAgent ? state.agents.find((a) => a.id === live.focusAgent) : undefined;

  return (
    <div className="grid h-full grid-cols-[1.1fr_1fr_1fr_1fr_1.3fr] gap-5">
      <div className="min-w-0">
        <Label>CURRENT BLOCK</Label>
        <p className="text-[oklch(0.88_0.13_80)]">{live.label}</p>
        {live.waiting !== null && <p className="text-dim">waiting {num(live.waiting)}s</p>}
        <div className="mt-3">
          <Label>EXECUTION STACK</Label>
          <p className="text-dim">{runNo(live.receiptId)} · {live.eventLabel}</p>
          {live.stack.map((f, i) => (
            <p key={i} className={i === live.stack.length - 1 ? "text-fg" : "text-fg-2"} style={{ paddingLeft: 10 + i * 10 }}>
              {f.label}
            </p>
          ))}
        </div>
      </div>
      <div className="min-w-0">
        <Label>EVENT PAYLOAD</Label>
        {Object.entries(live.payload).map(([k, v]) => (
          <p key={k} className="flex justify-between gap-3">
            <span className="text-dim">{k}</span>
            <span className="truncate text-fg">{k === "timestamp" ? clock(Number(v)) : show(v, state)}</span>
          </p>
        ))}
      </div>
      <div className="min-w-0">
        <Label>VARIABLES</Label>
        {vars.length === 0 && <p className="text-dim">none yet</p>}
        {vars.map(([k, v]) => (
          <p key={k} className={`flex justify-between gap-3 rounded px-1 transition-colors ${changed.has(k) ? "bg-signal/15" : ""}`}>
            <span className="text-var">{k}</span>
            <span className="truncate text-fg">{v}</span>
          </p>
        ))}
      </div>
      <div className="min-w-0">
        <Label>AGENT</Label>
        {agent ? (
          <>
            <p className="text-fg">{agent.name}</p>
            <p className="text-fg-2">{agent.species}</p>
            <p className="truncate text-dim">{agent.personality}</p>
            <p className="mt-1 text-dim">
              budget {num(agent.budget)} · score {num(agent.score)} · {agent.memory.length} memories
            </p>
          </>
        ) : (
          <p className="text-dim">no agent in use</p>
        )}
      </div>
      <div className="min-w-0">
        <Label>OUTPUTS</Label>
        {receipt?.entries.slice(1).slice(-6).map((e, i) => (
          <p key={i} className={`truncate ${e.status === "error" ? "text-err" : "text-fg-2"}`}>
            {e.text}
            {e.simulated && <span className="ml-2 text-[oklch(0.88_0.13_80)]/80">SIM</span>}
          </p>
        ))}
      </div>
    </div>
  );
}

/** Execution log and debugger, under the canvas. */
export function ConsolePane() {
  const state = useRuntimeStore((s) => s.state);
  const view = useRuntimeStore((s) => s.view);
  const setView = useRuntimeStore((s) => s.setView);
  const tab = (v: typeof view, label: string) => (
    <button
      role="tab"
      aria-selected={view === v}
      onClick={() => setView(v)}
      className={`relative py-2 transition-colors ${view === v ? "text-fg" : "text-muted hover:text-fg-2"}`}
    >
      {label}
      {view === v && <span className="absolute inset-x-0 -bottom-px h-px bg-signal" />}
    </button>
  );

  return (
    <section className="flex h-[176px] shrink-0 flex-col border-t border-[#1d1f23] bg-[#0c0d0e] font-mono" aria-label="Console and debugger">
      <header className="flex h-8 shrink-0 items-center justify-between border-b border-[#18191c] px-3.5 text-[10.5px] tracking-[0.12em] text-muted">
        <nav className="flex items-center gap-3.5" role="tablist">
          {tab("console", "CONSOLE")}
          {tab("debugger", "DEBUGGER")}
          <span className="text-dim">
            {state.executionCount} {state.executionCount === 1 ? "RUN" : "RUNS"}
          </span>
        </nav>
        <Controls />
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-3.5 py-2 text-[12px] leading-[1.75]">
        {view === "console" ? <ConsoleLog state={state} /> : <Debugger state={state} />}
      </div>
    </section>
  );
}
