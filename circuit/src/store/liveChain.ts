"use client";

/**
 * LIVE TOKEN mode: watches the project's token (Project setup → Existing
 * token) and feeds real trades into the program, the same way simulator
 * buttons do. Polls /api/chain/events every POLL_MS with cursors, so nothing
 * is replayed or doubled; holder counts are polled less often.
 *
 * This runs in the open tab. The always-on server (Phase 7) replaces polling
 * with Helius webhooks and keeps running when the tab is closed.
 */
import { create } from "zustand";
import { fetchHolders, pollChain } from "@/lib/chain/client";
import { isAddress } from "@/lib/chain/parse";
import { useProjectStore } from "./project";
import { useRuntimeStore } from "./runtime";

const POLL_MS = 10_000;
const HOLDERS_MS = 5 * 60_000;
/** If the program falls this far behind (paused, debugging), older trades are dropped. */
const MAX_BACKLOG = 50;

export type LiveStatus = "off" | "starting" | "watching" | "error";

interface LiveChainStore {
  status: LiveStatus;
  mint: string | null;
  lastCheck: number | null;
  seen: number;
  holders: number | null;
  error: string | null;
  start: () => void;
  stop: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let cursor: string | null = null;
let walletCursor: string | null = null;
let lastHolders = 0;
let generation = 0;

export const useLiveChain = create<LiveChainStore>((set, get) => {
  const schedule = (gen: number, ms: number) => {
    timer = setTimeout(() => void tick(gen), ms);
  };

  const tick = async (gen: number) => {
    if (gen !== generation) return; // stopped or restarted meanwhile
    const { setup } = useProjectStore.getState();
    const mint = get().mint!;
    const wallet = isAddress(setup.walletAddress) && setup.monitor.wallet ? setup.walletAddress : undefined;
    try {
      const r = await pollChain({ mint, wallet, until: cursor, walletUntil: walletCursor });
      if (gen !== generation) return;
      cursor = r.cursor ?? cursor;
      walletCursor = r.walletCursor ?? walletCursor;
      const runtime = useRuntimeStore.getState();
      const wanted = r.events.filter((e) => e.type !== "trade" || setup.monitor.trades || setup.monitor.volume);
      const events = runtime.queued > MAX_BACKLOG ? wanted.slice(-5) : wanted;
      // An invalid program can't run; keep watching quietly until it's fixed.
      if (useProjectStore.getState().program) for (const e of events) runtime.fireEvent(e, false);
      set({ status: "watching", lastCheck: Date.now(), seen: get().seen + r.events.filter((e) => e.type === "trade").length, error: null });

      const chain = runtime.chainStatus;
      if (chain?.holders && Date.now() - lastHolders > HOLDERS_MS) {
        lastHolders = Date.now();
        const { holders } = await fetchHolders(mint);
        const prev = get().holders;
        set({ holders });
        if (prev !== null && holders !== prev)
          runtime.fireEvent({ type: "holders", source: "live", timestamp: Date.now(), data: { from: prev, to: holders } }, false);
      }
    } catch (e) {
      if (gen !== generation) return;
      set({ status: "error", lastCheck: Date.now(), error: e instanceof Error ? e.message : String(e) });
    }
    schedule(gen, POLL_MS);
  };

  return {
    status: "off",
    mint: null,
    lastCheck: null,
    seen: 0,
    holders: null,
    error: null,

    start: () => {
      const { setup, notify } = useProjectStore.getState();
      const chain = useRuntimeStore.getState().chainStatus;
      if (!chain?.enabled) {
        notify("error", "Live mode needs a Solana RPC: add HELIUS_API_KEY (or CIRCUIT_SOLANA_RPC_URL) to .env.local and restart.");
        return;
      }
      if (!isAddress(setup.tokenAddress)) {
        notify("info", "Set your token's mint address in Project setup → Existing token first.");
        useProjectStore.getState().openDialog("setup");
        return;
      }
      get().stop();
      generation += 1;
      cursor = null;
      walletCursor = null;
      lastHolders = 0;
      set({ status: "starting", mint: setup.tokenAddress, seen: 0, holders: null, error: null, lastCheck: null });
      void tick(generation); // first poll only sets the cursors: no old trades are replayed
    },

    stop: () => {
      generation += 1;
      if (timer) clearTimeout(timer);
      timer = null;
      set({ status: "off" });
    },
  };
});

if (typeof window !== "undefined") {
  // A different project means a different token: stop watching.
  useProjectStore.subscribe((s, prev) => {
    if (s.current?.id !== prev.current?.id) useLiveChain.getState().stop();
  });
}
