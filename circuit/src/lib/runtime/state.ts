/**
 * Project runtime state: everything a program's executions leave behind.
 * It persists per project (localStorage) so a project keeps "living" across
 * reloads. All money here is simulated.
 */
import { z } from "zod";
import type { Value } from "./values";

export interface Agent {
  id: string;
  name: string;
  identity: string;
  species: string;
  personality: string;
  visual: { mode: "placeholder" | "emoji" | "image" | "pending"; value: string };
  goal: string;
  model: string;
  memoryEnabled: boolean;
  memory: string[];
  inventory: Value[];
  budget: number;
  score: number;
  tools: string[];
  custom: Record<string, Value>;
  inWorld: boolean;
  createdAt: number;
  history: { at: number; text: string }[];
}

export interface Entity {
  id: string;
  type: string;
  name: string;
  props: Record<string, Value>;
  image: string;
  createdAt: number;
}

export interface Submission {
  id: string;
  wallet: string;
  content: string;
  score: number | null;
  feedback: string;
  status: "pending" | "approved" | "rejected" | "rewarded";
  at: number;
}

export interface Bounty {
  id: string;
  title: string;
  description: string;
  reward: number;
  deadline: number;
  status: "open" | "closed";
  submissions: Submission[];
  createdAt: number;
}

export interface FeedItem {
  at: number;
  kind: "post" | "notify";
  text: string;
  run: number;
}

export interface ReceiptEntry {
  /** Upper-case op name, e.g. CREATE_AGENT. */
  op: string;
  blockId?: string;
  text: string;
  details: string[];
  status: "ok" | "error" | "skipped";
  simulated?: boolean;
}

export type RunStatus = "running" | "complete" | "error" | "stopped" | "step_limit";

export interface Receipt {
  id: number;
  startedAt: number;
  finishedAt: number | null;
  event: { type: string; label: string; source: string; data: Record<string, Value>; proof?: { signature: string; slot: number; explorer: string } };
  hatId?: string;
  status: RunStatus;
  error: string | null;
  steps: number;
  entries: ReceiptEntry[];
}

export interface RuntimeState {
  version: 1;
  seed: number;
  executionCount: number;
  nextId: number;
  variables: Record<string, Value>;
  agents: Agent[];
  entities: Entity[];
  collections: Record<string, Value[]>;
  counters: Record<string, number>;
  website: Record<string, Value>;
  feed: FeedItem[];
  treasury: { SOL: number; USDC: number };
  budgets: Record<string, number>;
  portfolio: Record<string, number>;
  bounties: Bounty[];
  market: { totalVolume: number; marketCap: number; holders: number; trades: number; ticks: number };
  cooldowns: Record<string, number>;
  runs: Receipt[];
}

/** Receipts and feed items kept per project. Older ones are dropped. */
export const MAX_RUNS = 50;
export const MAX_FEED = 200;

export function initialState(seed = Date.now() % 2147483647): RuntimeState {
  return {
    version: 1,
    seed,
    executionCount: 0,
    nextId: 1,
    variables: {},
    agents: [],
    entities: [],
    collections: {},
    counters: {},
    website: {},
    feed: [],
    treasury: { SOL: 5, USDC: 250 },
    budgets: {},
    portfolio: {},
    bounties: [],
    market: { totalVolume: 0, marketCap: 42000, holders: 120, trades: 0, ticks: 0 },
    cooldowns: {},
    runs: [],
  };
}

// Persisted state is read back leniently: unknown keys are dropped, missing
// ones fall back to the initial values, so older saves keep loading.
const ValueSchema: z.ZodType<Value> = z.lazy(() =>
  z.union([z.null(), z.string(), z.number(), z.boolean(), z.array(ValueSchema), z.record(z.string(), ValueSchema)]),
);
const base = initialState(1);
const loose = <T extends z.ZodType>(schema: T, fallback: z.infer<T>) => schema.catch(fallback as never);

const StateSchema = z.object({
  version: z.literal(1),
  seed: z.number(),
  executionCount: loose(z.number(), 0),
  nextId: loose(z.number(), 1),
  variables: loose(z.record(z.string(), ValueSchema), {}),
  agents: loose(z.array(z.any()), []),
  entities: loose(z.array(z.any()), []),
  collections: loose(z.record(z.string(), z.array(ValueSchema)), {}),
  counters: loose(z.record(z.string(), z.number()), {}),
  website: loose(z.record(z.string(), ValueSchema), {}),
  feed: loose(z.array(z.any()), []),
  treasury: loose(z.object({ SOL: z.number(), USDC: z.number() }), base.treasury),
  budgets: loose(z.record(z.string(), z.number()), {}),
  portfolio: loose(z.record(z.string(), z.number()), {}),
  bounties: loose(z.array(z.any()), []),
  market: loose(
    z.object({ totalVolume: z.number(), marketCap: z.number(), holders: z.number(), trades: z.number(), ticks: z.number() }),
    base.market,
  ),
  cooldowns: loose(z.record(z.string(), z.number()), {}),
  runs: loose(z.array(z.any()), []),
});

/** Parses persisted JSON; null if it isn't a runtime state at all. */
export function readState(json: string | null): RuntimeState | null {
  if (!json) return null;
  try {
    const parsed = StateSchema.safeParse(JSON.parse(json));
    if (!parsed.success) return null;
    // A run that was mid-flight when the page closed didn't finish.
    const runs = (parsed.data.runs as Receipt[]).map((r) =>
      r.status === "running" ? { ...r, status: "stopped" as const, error: "Interrupted (page closed)" } : r,
    );
    return { ...parsed.data, runs } as RuntimeState;
  } catch {
    return null;
  }
}

const key = (projectId: string) => `circuit:runtime:${projectId}`;

export function loadRuntime(projectId: string): RuntimeState {
  try {
    return readState(localStorage.getItem(key(projectId))) ?? initialState();
  } catch {
    return initialState();
  }
}

export function saveRuntime(projectId: string, state: RuntimeState): boolean {
  try {
    localStorage.setItem(key(projectId), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function deleteRuntime(projectId: string) {
  try {
    localStorage.removeItem(key(projectId));
  } catch {
    // ignore
  }
}
