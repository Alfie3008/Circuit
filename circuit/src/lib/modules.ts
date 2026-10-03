/**
 * Modules: every integration is a module exposing events, values and actions
 * (hats, reporters and statements). The language never special-cases one;
 * a module is just the blocks it contributes plus the adapter behind them.
 */
import { BLOCKS } from "@/lib/blocks";
import type { BlockSpec, ModuleId } from "@/lib/blocks/types";

export type ModuleStatus = "built-in" | "local" | "live" | "mock" | "simulated";

export interface ModuleInfo {
  id: ModuleId;
  name: string;
  description: string;
  status: ModuleStatus;
  /** Where it's heading, if it isn't real yet. */
  next?: string;
}

export const MODULE_INFO: ModuleInfo[] = [
  { id: "core", name: "Core", description: "Control flow, logic, maths, lists and variables. The language itself.", status: "built-in" },
  { id: "solana", name: "Solana", description: "Token events (trades, volume, holders, fees) and wallet reads.", status: "live", next: "Live and read-only when the server has a Solana RPC (Helius); the simulator otherwise." },
  { id: "ai", name: "AI", description: "Agents, ask/choose/classify/summarize, identities, generated text and images.", status: "live", next: "Real Claude when the server has an Anthropic key, with daily spending caps; mock answers otherwise." },
  { id: "browser", name: "Browser", description: "Web search, opening pages, extracting text, following links, HTTP.", status: "mock", next: "Real read-only fetching behind an allowlist." },
  { id: "website", name: "Website", description: "Project world: entities, collections, feed, counters, site state and events.", status: "local" },
  { id: "finance", name: "Finance", description: "Treasury, named budgets, transfers, buys and sells.", status: "simulated", next: "Always simulated in the prototype. No keys, no real transactions." },
  { id: "bounties", name: "Bounties", description: "Bounties, submissions, AI review, approval and rewards.", status: "local", next: "Rewards are simulated payouts." },
  { id: "social", name: "Social", description: "Webhooks, posts to X / Discord / Telegram, email.", status: "simulated", next: "Outbound sends are logged, never delivered." },
];

export const STATUS_TEXT: Record<ModuleStatus, string> = {
  "built-in": "Real: part of the interpreter",
  local: "Real: state kept in this project",
  live: "Real with a key · mock without",
  mock: "Mock: canned responses",
  simulated: "Simulated: nothing leaves the app",
};

export interface ModuleBlocks {
  events: BlockSpec[];
  values: BlockSpec[];
  actions: BlockSpec[];
}

export function blocksOf(id: ModuleId): ModuleBlocks {
  const mine = BLOCKS.filter((b) => b.module === id);
  return {
    events: mine.filter((b) => b.shape === "hat"),
    values: mine.filter((b) => b.shape === "reporter" || b.shape === "boolean"),
    actions: mine.filter((b) => b.shape === "statement" || b.shape === "terminal"),
  };
}

/** "when trade happens [side]": the block's first row, with slots in brackets. */
export function blockTitle(spec: BlockSpec): string {
  return spec.rows[0].items
    .map((i) => (i.kind === "label" ? i.text : i.kind === "statement" ? "" : i.kind === "value" ? "( )" : `[${i.name.toLowerCase()}]`))
    .filter(Boolean)
    .join(" ");
}
