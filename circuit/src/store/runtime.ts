"use client";

/**
 * Execution controller: fires simulated events, paces executions so they can
 * be watched block by block, and supports pause / step / stop. Runtime state
 * persists per project.
 *
 * The interpreter mutates a private working copy (`working`); React sees
 * snapshots of it via `state`, committed after each step.
 */
import { create } from "zustand";
import type { Program } from "@/lib/ir";
import { mockAdapters } from "@/lib/runtime/adapters";
import { begin, finish, trigger } from "@/lib/runtime/engine";
import { describeHat, simulateFor, type CircuitEvent, type Match } from "@/lib/runtime/events";
import type { Frame } from "@/lib/runtime/interpreter";
import { Rng } from "@/lib/runtime/rng";
import { initialState, loadRuntime, saveRuntime, type RuntimeState } from "@/lib/runtime/state";
import { clone, type Value } from "@/lib/runtime/values";
import { useProjectStore } from "./project";

export type Status = "idle" | "running" | "paused";
export type Speed = "slow" | "normal" | "fast" | "instant";

export const SPEEDS: Record<Speed, number> = { slow: 900, normal: 380, fast: 110, instant: 0 };
/** Executions one trigger may cause, including events the program raises itself. */
export const MAX_CHAIN = 25;
/** WAIT blocks are honoured, but compressed to at most this long in the simulator. */
const MAX_WAIT_MS = 3000;

export interface Live {
  receiptId: number;
  scriptIndex: number;
  eventLabel: string;
  payload: Record<string, Value>;
  blockId?: string;
  label: string;
  stack: Frame[];
  focusAgent: string | null;
  waiting: number | null;
}

interface RuntimeStore {
  projectId: string | null;
  state: RuntimeState;
  status: Status;
  debug: boolean;
  speed: Speed;
  live: Live | null;
  /** Block that failed in the last execution (cleared when the next one starts). */
  errorBlockId: string | null;
  queued: number;
  /** Bottom pane tab. */
  view: "console" | "debugger";

  load: (projectId: string) => void;
  /** Simulates the event for a script's hat; every script it triggers runs. */
  fireScript: (scriptIndex: number) => void;
  pause: () => void;
  resume: () => void;
  step: () => void;
  stop: () => void;
  setDebug: (on: boolean) => void;
  setSpeed: (speed: Speed) => void;
  resetState: () => void;
  setView: (view: "console" | "debugger") => void;
}

type Job = { kind: "event"; event: CircuitEvent; program: Program } | { kind: "match"; match: Match; program: Program };

// Controller internals (not React state).
let working: RuntimeState = initialState();
let queue: Job[] = [];
let pumping = false;
let aborted = false;
let chainRuns = 0;
let release: (() => void) | null = null;
let lastCommit = 0;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const useRuntimeStore = create<RuntimeStore>((set, get) => {
  const commit = (force = false) => {
    const now = performance.now();
    // In instant mode, don't snapshot every step; the UI can't show them anyway.
    if (!force && get().speed === "instant" && now - lastCommit < 120) return;
    lastCommit = now;
    set({ state: clone(working), queued: queue.length });
  };

  const persist = () => {
    const id = get().projectId;
    if (id && !saveRuntime(id, working))
      useProjectStore.getState().notify("error", "Browser storage is full: runtime state isn't being saved.");
  };

  /** Waits between steps; blocks while paused until resume/step/stop. */
  const gate = async () => {
    if (aborted) return;
    if (get().status === "paused") {
      await new Promise<void>((r) => (release = r));
      release = null;
      return;
    }
    const ms = SPEEDS[get().speed];
    if (ms) await sleep(ms);
  };

  const runMatch = async (match: Match, program: Program, rng: Rng) => {
    const adapters = mockAdapters(rng);
    const { receipt, run } = begin(working, match, {
      rng,
      adapters,
      raise: (event) => queue.push({ kind: "event", event, program }),
    });
    set({ errorBlockId: null });
    if (get().debug) set({ status: "paused" });
    const live: Live = {
      receiptId: receipt.id,
      scriptIndex: match.scriptIndex,
      eventLabel: match.label,
      payload: match.payload,
      blockId: match.script.event.id,
      label: "EVENT",
      stack: [],
      focusAgent: null,
      waiting: null,
    };
    set({ live: { ...live } });
    commit(true);
    await gate(); // show the hat lit before the first block runs

    let r = aborted ? null : await run.next();
    while (r && !r.done) {
      const t = r.value;
      working.seed = rng.seed;
      if (t.kind === "step") Object.assign(live, { blockId: t.id, label: t.label, stack: t.stack, focusAgent: t.focusAgent, waiting: null });
      else Object.assign(live, { waiting: t.seconds });
      set({ live: { ...live } });
      commit();
      if (t.kind === "wait" && get().speed !== "instant") await sleep(Math.min(t.seconds * 1000, MAX_WAIT_MS));
      await gate();
      if (aborted) break;
      r = await run.next();
    }

    working.seed = rng.seed;
    if (r?.done) {
      finish(working, receipt, r.value);
      if (r.value.errorBlockId) set({ errorBlockId: r.value.errorBlockId });
      if (r.value.stopAll) queue = [];
    } else {
      await run.return?.(undefined as never);
      finish(working, receipt, { status: "stopped", error: "Stopped by you", steps: receipt.steps });
    }
    commit(true);
    persist();
  };

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    aborted = false;
    chainRuns = 0;
    const rng = new Rng(working.seed);
    if (get().status === "idle") set({ status: get().debug ? "paused" : "running" });
    try {
      while (queue.length && !aborted) {
        const job = queue.shift()!;
        if (job.kind === "event") {
          if (job.event.source !== "runtime") chainRuns = 0; // a new trigger from you
          const matches = trigger(working, job.program, job.event, rng);
          working.seed = rng.seed;
          queue.unshift(...matches.map((match) => ({ kind: "match" as const, match, program: job.program })));
          commit(true);
          continue;
        }
        if (++chainRuns > MAX_CHAIN) {
          useProjectStore.getState().notify("error", `Stopped a chain of ${MAX_CHAIN} executions. Does a script keep triggering itself?`);
          queue = [];
          break;
        }
        if (get().status === "idle") set({ status: get().debug ? "paused" : "running" });
        await runMatch(job.match, job.program, rng);
      }
    } finally {
      queue = [];
      pumping = false;
      aborted = false;
      set({ status: "idle", live: null, queued: 0 });
      commit(true);
      persist();
    }
  };

  return {
    projectId: null,
    state: working,
    status: "idle",
    debug: false,
    speed: "normal",
    live: null,
    errorBlockId: null,
    queued: 0,
    view: "console",

    load: (projectId) => {
      if (get().projectId === projectId) return;
      if (pumping) get().stop();
      persist();
      working = loadRuntime(projectId);
      set({ projectId, state: clone(working), live: null, errorBlockId: null });
    },

    fireScript: (scriptIndex) => {
      const { program, irError } = useProjectStore.getState();
      if (!program) {
        useProjectStore.getState().notify("error", `The program has an error, so it can't run yet.\n${irError ?? ""}`);
        return;
      }
      const script = program.scripts[scriptIndex];
      if (!script) return;
      if (script.event.disabled) {
        useProjectStore.getState().notify("info", "That event block is disabled.");
        return;
      }
      const rng = new Rng(working.seed);
      const event = simulateFor(script.event, working, rng);
      working.seed = rng.seed;
      queue.push({ kind: "event", event, program });
      set({ queued: queue.length });
      void pump();
    },

    pause: () => {
      if (get().status === "running") set({ status: "paused" });
    },
    resume: () => {
      if (get().status !== "paused") return;
      set({ status: "running" });
      release?.();
    },
    step: () => {
      if (get().status === "paused") release?.();
    },
    stop: () => {
      if (!pumping) return;
      aborted = true;
      queue = [];
      release?.();
    },
    setDebug: (on) => {
      set({ debug: on, view: on ? "debugger" : get().view });
      if (on && get().status === "running") set({ status: "paused" });
    },
    setSpeed: (speed) => set({ speed }),
    setView: (view) => set({ view }),
    resetState: () => {
      if (pumping) get().stop();
      working = initialState();
      set({ state: clone(working), live: null, errorBlockId: null });
      persist();
    },
  };
});

/** Run-menu entries: one per script, labelled by its event. */
export function scriptEvents(program: Program | null) {
  return (program?.scripts ?? []).map((s, i) => ({ index: i, label: describeHat(s.event), disabled: !!s.event.disabled, hatId: s.event.id }));
}

if (typeof window !== "undefined") {
  // Follow the open project; keep state on page hide.
  useProjectStore.subscribe((s, prev) => {
    if (s.current?.id && s.current.id !== prev.current?.id) useRuntimeStore.getState().load(s.current.id);
  });
  window.addEventListener("pagehide", () => {
    const id = useRuntimeStore.getState().projectId;
    if (id) saveRuntime(id, working);
  });
}
