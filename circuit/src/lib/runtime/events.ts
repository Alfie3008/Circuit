/**
 * Normalized CIRCUIT events and dispatch.
 *
 * Every source (the simulator now, Helius in Phase 6) produces the same
 * normalized event. `dispatch` then decides which scripts it triggers and with
 * what payload: one trade can fire "when trade happens", "when volume
 * changes" and "every 10 SOL of volume" (if it crosses a multiple).
 */
import type { IRNode, Program, Script } from "@/lib/ir";
import type { Rng } from "./rng";
import type { RuntimeState } from "./state";
import { isRef, ref, round, toList, toNumber, type Value } from "./values";

export type EventKind =
  | "trade"
  | "creator_fees"
  | "market_cap"
  | "holders"
  | "wallet_receives"
  | "token_graduates"
  | "tick"
  | "time"
  | "webhook"
  | "website_event"
  | "agent_completes"
  | "bounty_submission"
  | "button";

/** Where a live event happened on chain (Solscan-verifiable). */
export interface Proof {
  signature: string;
  slot: number;
  explorer: string;
}

export interface CircuitEvent {
  type: EventKind;
  /** simulator: made up · runtime: raised by the program · live: on chain · schedule: the server's clock. */
  source: "simulator" | "runtime" | "live" | "schedule";
  timestamp: number;
  data: Record<string, Value>;
  /** Set for live events: the transaction that caused it. */
  proof?: Proof;
}

type Market = RuntimeState["market"];

export interface Match {
  scriptIndex: number;
  script: Script;
  /** What `event [field]` reads inside this script. */
  payload: Record<string, Value>;
  label: string;
  /** The event that triggered it (source and proof go on the receipt). */
  event: CircuitEvent;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : 0);
const fmt = (n: number) => String(round(n, 3));
const toText = (v: Value | undefined) => (typeof v === "string" ? v : v == null ? "" : String(v));
const same = (a: Value | undefined, b: Value | undefined) => toText(a).trim().toLowerCase() === toText(b).trim().toLowerCase();

/** Which normalized event kind triggers a hat. */
export function kindForHat(hat: IRNode): EventKind {
  switch (hat.type) {
    case "trade":
    case "volume_changed":
    case "volume_milestone":
      return "trade";
    case "market_cap_crosses":
      return "market_cap";
    case "holder_count_crosses":
      return "holders";
    case "every_minutes":
      return "tick";
    case "at_time":
      return "time";
    default:
      return hat.type as EventKind;
  }
}

/** Short human description of a hat, used in the Run menu. */
export function describeHat(hat: IRNode): string {
  switch (hat.type) {
    case "trade":
      return hat.side === "any_side" ? "Trade happens" : `Trade (${str(hat.side)})`;
    case "volume_changed":
      return "Volume changes";
    case "volume_milestone":
      return `Every ${fmt(num(hat.amount))} SOL of volume`;
    case "creator_fees":
      return "Creator fees arrive";
    case "market_cap_crosses":
      return `Market cap crosses ${str(hat.direction)} $${fmt(num(hat.threshold))}`;
    case "holder_count_crosses":
      return `Holders cross ${str(hat.direction)} ${fmt(num(hat.threshold))}`;
    case "wallet_receives":
      return `Wallet ${str(hat.wallet)} receives funds`;
    case "token_graduates":
      return "Token graduates";
    case "every_minutes":
      return `Every ${fmt(num(hat.minutes))} minutes`;
    case "at_time":
      return `At ${str(hat.time)}`;
    case "webhook":
      return `Webhook ${str(hat.path)}`;
    case "website_event":
      return `Website event “${str(hat.name)}”`;
    case "agent_completes":
      return "Agent completes task";
    case "bounty_submission":
      return "Bounty submission arrives";
    case "button":
      return `Button “${str(hat.label)}” pressed`;
    default:
      return hat.type;
  }
}

const shortWallet = (rng: Rng) => {
  const abc = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const part = (n: number) => Array.from({ length: n }, () => abc[rng.int(0, abc.length - 1)]).join("");
  return `${part(4)}…${part(4)}`;
};

/**
 * A simulated event that will trigger `hat` (and anything else listening).
 * E.g. for "every 10 SOL of volume" it is a trade just big enough to cross
 * the next multiple of 10.
 */
export function simulateFor(hat: IRNode, state: RuntimeState, rng: Rng, now = Date.now()): CircuitEvent {
  const ev = (type: EventKind, data: Record<string, Value>): CircuitEvent => ({ type, source: "simulator", timestamp: now, data });
  const m = state.market;
  switch (hat.type) {
    case "trade":
    case "volume_changed": {
      const side = hat.type === "trade" && hat.side !== "any_side" ? str(hat.side) : rng.next() < 0.6 ? "buy" : "sell";
      return ev("trade", { amount: rng.range(0.2, 3), side, wallet: shortWallet(rng), token: "TOKEN" });
    }
    case "volume_milestone": {
      const step = Math.max(num(hat.amount), 0.001);
      const next = (Math.floor(m.totalVolume / step) + 1) * step;
      return ev("trade", { amount: round(next - m.totalVolume + 0.01, 3), side: "buy", wallet: shortWallet(rng), token: "TOKEN" });
    }
    case "market_cap_crosses": {
      const t = num(hat.threshold);
      const above = hat.direction !== "below";
      return ev("market_cap", { from: above ? Math.min(m.marketCap, t * 0.95) : Math.max(m.marketCap, t * 1.05), to: round(above ? t * 1.04 : t * 0.96, 0) });
    }
    case "holder_count_crosses": {
      const t = num(hat.threshold);
      const above = hat.direction !== "below";
      return ev("holders", { from: above ? Math.min(m.holders, t - 1) : Math.max(m.holders, t + 1), to: above ? t + rng.int(0, 3) : t - rng.int(0, 3) });
    }
    case "creator_fees":
      return ev("creator_fees", { amount: rng.range(0.05, 0.4), wallet: "creator" });
    case "wallet_receives":
      return ev("wallet_receives", { wallet: str(hat.wallet), amount: rng.range(0.05, 1), from: shortWallet(rng) });
    case "token_graduates":
      return ev("token_graduates", { token: "TOKEN" });
    case "every_minutes":
      return ev("tick", { minutes: num(hat.minutes) });
    case "at_time":
      return ev("time", { time: str(hat.time) });
    case "webhook":
      return ev("webhook", { path: str(hat.path), payload: { hello: "world" } });
    case "website_event":
      return ev("website_event", { name: str(hat.name), payload: { page: "/" } });
    case "agent_completes": {
      const agent = state.agents.length ? state.agents[rng.int(0, state.agents.length - 1)] : null;
      return ev("agent_completes", { agent: agent ? ref("agent", agent.id) : null, result: "Task finished (simulated)" });
    }
    case "bounty_submission":
      return ev("bounty_submission", { wallet: shortWallet(rng) });
    case "button":
    default:
      return ev("button", { label: str(hat.label) });
  }
}

/**
 * Applies an event's effect on the simulated world (volume, market cap,
 * holders, treasury) and returns the market as it was before.
 */
export function applyEvent(state: RuntimeState, event: CircuitEvent, rng: Rng): Market {
  const before = { ...state.market };
  const m = state.market;
  const d = event.data;
  switch (event.type) {
    case "trade": {
      const amount = toNumber(d.amount);
      m.totalVolume = round(m.totalVolume + amount, 4);
      m.trades += 1;
      if (typeof d.marketCap === "number") m.marketCap = d.marketCap; // live: priced from the trade
      else m.marketCap = Math.max(1000, Math.round(m.marketCap + (d.side === "sell" ? -1 : 1) * amount * 900));
      if (event.source === "simulator" && d.side === "buy" && rng.next() < 0.5) m.holders += 1;
      break;
    }
    case "market_cap":
      m.marketCap = toNumber(d.to);
      before.marketCap = toNumber(d.from);
      break;
    case "holders":
      m.holders = toNumber(d.to);
      before.holders = toNumber(d.from);
      break;
    case "creator_fees":
      // Fees land in the (simulated) project treasury.
      state.treasury.SOL = round(state.treasury.SOL + toNumber(d.amount));
      break;
    case "tick":
      m.ticks += 1;
      break;
    case "bounty_submission": {
      if (isRef(d.submission, "submission")) break; // raised by the program; already stored
      const bounty = [...state.bounties].reverse().find((b) => b.status === "open");
      if (bounty) {
        const id = `sub_${state.nextId++}`;
        bounty.submissions.push({ id, wallet: toText(d.wallet), content: `Submission for “${bounty.title}”`, score: null, feedback: "", status: "pending", at: event.timestamp });
        d.bounty = ref("bounty", bounty.id);
        d.submission = ref("submission", id);
      } else {
        d.bounty = null;
        d.submission = null;
      }
      break;
    }
  }
  return before;
}

type Add = (payload: Record<string, Value>, label: string) => void;

/** Market-cap and holder-count hats fire when the value crosses their threshold. */
function crossings(hat: IRNode, before: Market, after: Market, add: Add) {
  const crossed = (from: number, to: number, t: number) =>
    hat.direction === "below" ? from > t && to <= t : from < t && to >= t;
  const t = num(hat.threshold);
  if (hat.type === "market_cap_crosses" && crossed(before.marketCap, after.marketCap, t))
    add({ marketCap: after.marketCap }, `Market cap ${str(hat.direction)} $${fmt(t)}`);
  if (hat.type === "holder_count_crosses" && crossed(before.holders, after.holders, t))
    add({ holders: after.holders }, `Holders ${str(hat.direction)} ${fmt(t)}`);
}

/** Scripts this event triggers, in program order, with their payloads. */
export function dispatch(program: Program, event: CircuitEvent, before: Market, after: Market): Match[] {
  const out: Match[] = [];
  const d = event.data;
  const ts = event.timestamp;
  program.scripts.forEach((script, scriptIndex) => {
    const hat = script.event;
    if (hat.disabled) return;
    const add = (payload: Record<string, Value>, label: string) =>
      out.push({ scriptIndex, script, payload: { ...payload, timestamp: ts }, label, event });
    switch (event.type) {
      case "trade": {
        const amount = toNumber(d.amount);
        if (hat.type === "trade" && (hat.side === "any_side" || hat.side === d.side))
          add({ amount, wallet: d.wallet ?? null, side: d.side ?? null, token: d.token ?? null }, `Trade · ${toText(d.side)} ${fmt(amount)} SOL`);
        if (hat.type === "volume_changed")
          add({ volumeChange: amount, totalVolume: after.totalVolume }, `Volume +${fmt(amount)} SOL`);
        if (hat.type === "volume_milestone") {
          const step = num(hat.amount);
          if (step > 0 && Math.floor(before.totalVolume / step) < Math.floor(after.totalVolume / step)) {
            const milestone = round(Math.floor(after.totalVolume / step) * step, 4);
            add({ milestone, totalVolume: after.totalVolume }, `Volume reached ${fmt(milestone)} SOL`);
          }
        }
        // Trades move market cap and holders, so they can cross thresholds too.
        crossings(hat, before, after, add);
        break;
      }
      case "market_cap":
      case "holders":
        crossings(hat, before, after, add);
        break;
      case "creator_fees":
        if (hat.type === "creator_fees") add({ amount: toNumber(d.amount), wallet: d.wallet ?? null }, `${fmt(toNumber(d.amount))} SOL in fees collected`);
        break;
      case "wallet_receives":
        if (hat.type === "wallet_receives" && (!str(hat.wallet) || same(hat.wallet as string, d.wallet)))
          add({ amount: toNumber(d.amount), wallet: d.wallet ?? null, from: d.from ?? null }, `${toText(d.wallet)} received ${fmt(toNumber(d.amount))} SOL`);
        break;
      case "token_graduates":
        if (hat.type === "token_graduates") add({ token: d.token ?? null }, "Token graduated");
        break;
      case "tick":
        if (hat.type === "every_minutes" && (d.minutes == null || num(hat.minutes) === toNumber(d.minutes)))
          add({ tick: after.ticks }, `Timer · every ${fmt(num(hat.minutes))} min`);
        break;
      case "time":
        if (hat.type === "at_time" && (d.time == null || same(hat.time as string, d.time))) add({}, `Time ${toText(d.time)}`);
        break;
      case "webhook":
        if (hat.type === "webhook" && same(hat.path as string, d.path)) add({ payload: d.payload ?? null }, `Webhook ${toText(d.path)}`);
        break;
      case "website_event":
        if (hat.type === "website_event" && same(hat.name as string, d.name)) add({ name: d.name ?? null, payload: d.payload ?? null }, `Website event ${toText(d.name)}`);
        break;
      case "agent_completes":
        if (hat.type === "agent_completes") add({ agent: d.agent ?? null, result: d.result ?? null }, "Agent completed a task");
        break;
      case "bounty_submission":
        if (hat.type === "bounty_submission")
          add({ submission: d.submission ?? null, bounty: d.bounty ?? null, wallet: d.wallet ?? null }, isRef(d.submission) ? "Bounty submission arrived" : "Submission (no open bounty)");
        break;
      case "button":
        if (hat.type === "button" && same(hat.label as string, d.label)) add({}, `Button “${toText(d.label)}” pressed`);
        break;
    }
  });
  return out;
}

/** Labels for list-type text fields that may arrive as text or as a parsed list. */
export const listField = (v: unknown): string[] => toList(v as Value).map((x) => toText(x)).filter(Boolean);

// ---------------------------------------------------------------------------
// Simulator presets: world-panel buttons and the live market feed
// ---------------------------------------------------------------------------

export type PresetId = "buy" | "sell" | "volume10" | "fees" | "holders" | "graduate" | "tick" | "submission";

export const PRESETS: { id: PresetId; label: string; hint: string }[] = [
  { id: "buy", label: "Buy", hint: "A random buy (0.2–3 SOL)" },
  { id: "sell", label: "Sell", hint: "A random sell (0.2–3 SOL)" },
  { id: "volume10", label: "+10 SOL", hint: "A 10 SOL buy: crosses volume milestones" },
  { id: "fees", label: "Fees", hint: "Creator fees land in the project treasury" },
  { id: "holders", label: "+50 holders", hint: "Holder count jumps by 50" },
  { id: "tick", label: "Timer", hint: "Fires every “every X minutes” script once" },
  { id: "submission", label: "Submission", hint: "Someone submits to the newest open bounty" },
  { id: "graduate", label: "Graduate", hint: "The token graduates" },
];

/** A normalized event for a simulator preset. Dispatch decides which scripts it triggers. */
export function presetEvent(id: PresetId, state: RuntimeState, rng: Rng, now = Date.now()): CircuitEvent {
  const ev = (type: EventKind, data: Record<string, Value>): CircuitEvent => ({ type, source: "simulator", timestamp: now, data });
  switch (id) {
    case "buy":
    case "sell":
      return ev("trade", { amount: rng.range(0.2, 3), side: id, wallet: shortWallet(rng), token: "TOKEN" });
    case "volume10":
      return ev("trade", { amount: 10, side: "buy", wallet: shortWallet(rng), token: "TOKEN" });
    case "fees":
      return ev("creator_fees", { amount: rng.range(0.05, 0.4), wallet: "creator" });
    case "holders":
      return ev("holders", { from: state.market.holders, to: state.market.holders + 50 });
    case "tick":
      return ev("tick", {});
    case "submission":
      return ev("bounty_submission", { wallet: shortWallet(rng) });
    case "graduate":
      return ev("token_graduates", { token: "TOKEN" });
  }
}

/** One step of the live market: mostly small trades, sometimes fees. */
export function marketEvent(state: RuntimeState, rng: Rng, now = Date.now()): CircuitEvent {
  if (rng.next() < 0.15) return presetEvent("fees", state, rng, now);
  return presetEvent(rng.next() < 0.68 ? "buy" : "sell", state, rng, now);
}

/** Events the program itself defines (button labels, webhook paths, site events), as one-click triggers. */
export function programTriggers(program: Program): { label: string; event: (now?: number) => CircuitEvent }[] {
  const out: { label: string; event: (now?: number) => CircuitEvent }[] = [];
  const seen = new Set<string>();
  for (const s of program.scripts) {
    const h = s.event;
    const mk = (key: string, label: string, type: EventKind, data: Record<string, Value>) => {
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ label, event: (now = Date.now()) => ({ type, source: "simulator", timestamp: now, data }) });
    };
    if (h.type === "button") mk(`b:${str(h.label)}`, str(h.label) || "Button", "button", { label: str(h.label) });
    if (h.type === "webhook") mk(`w:${str(h.path)}`, `POST ${str(h.path)}`, "webhook", { path: str(h.path), payload: { hello: "world" } });
    if (h.type === "website_event") mk(`s:${str(h.name)}`, `Site: ${str(h.name)}`, "website_event", { name: str(h.name), payload: {} });
  }
  return out;
}
