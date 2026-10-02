/**
 * What anyone can see about a published project at /p/<slug>: the program
 * itself (that's the point: the rules are public), its world, and its
 * receipts with on-chain proof. Nothing here is secret; owner-only settings
 * are left out.
 */
import type { Program } from "@/lib/ir";
import { initialState, type Agent, type Entity, type FeedItem, type Receipt, type RuntimeState } from "@/lib/runtime/state";
import type { Db, ServerProject } from "./types";

export interface PublicProject {
  id: string;
  slug: string;
  name: string;
  owner: string;
  live: boolean;
  timezone: string;
  token: string | null;
  wallet: string | null;
  createdAt: number;
  updatedAt: number;
  program: Program;
  world: {
    agents: Agent[];
    entities: Entity[];
    feed: FeedItem[];
    market: RuntimeState["market"];
    treasury: RuntimeState["treasury"];
    executions: number;
  };
  status: { liveSince: number | null; lastEventAt: number | null; lastError: string | null; dropped: number };
  receipts: Receipt[];
}

export async function publicProject(db: Db, slug: string, receiptLimit = 20): Promise<PublicProject | null> {
  const p: ServerProject | null = await db.getProjectBySlug(slug);
  if (!p) return null;
  const [row, receipts] = await Promise.all([db.getState(p.id), db.listReceipts(p.id, receiptLimit)]);
  const state = row?.state ?? initialState(1);
  const existing = p.setup.launchMode === "existing";
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    owner: p.owner,
    live: p.live,
    timezone: p.timezone,
    token: existing && p.setup.tokenAddress ? p.setup.tokenAddress : null,
    wallet: existing && p.setup.walletAddress ? p.setup.walletAddress : null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    program: p.program,
    world: {
      // Agents are made by the program, so they're public like everything else (recent memory only).
      agents: state.agents.slice(-60).map((a) => ({ ...a, memory: a.memory.slice(-10), history: a.history.slice(-10) })),
      entities: state.entities.slice(-60),
      feed: state.feed.slice(-50),
      market: state.market,
      treasury: state.treasury,
      executions: state.executionCount,
    },
    status: {
      liveSince: row?.meta.liveSince ?? null,
      lastEventAt: row?.meta.lastEventAt ?? null,
      lastError: row?.meta.lastError ?? null,
      dropped: row?.meta.dropped ?? 0,
    },
    receipts,
  };
}
