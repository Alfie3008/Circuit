/**
 * Real chain events for live projects, from two directions:
 * - pushed: Helius webhooks deliver transactions as they land
 * - pulled: the cron polls each project's token and wallet (the fallback when
 *   no webhook is set up, and a periodic safety net when one is)
 * Every event is claimed (signature + type) before it runs, so a transaction
 * that arrives both ways runs once.
 */
import { involvedAddresses, parseTransaction, type RpcTransaction } from "@/lib/chain/parse";
import { getSolUsd, getSupply, pollEvents } from "@/lib/chain/rpc";
import type { CircuitEvent } from "@/lib/runtime/events";
import type { Db, RunMeta, ServerProject } from "./types";

// --- live projects by address (cached briefly) -------------------------------

let index: { at: number; byAddress: Map<string, ServerProject[]> } | null = null;
const INDEX_MS = 30_000;

export async function liveByAddress(db: Db, now = Date.now()): Promise<Map<string, ServerProject[]>> {
  if (index && now - index.at < INDEX_MS) return index.byAddress;
  const byAddress = new Map<string, ServerProject[]>();
  for (const p of await db.listProjects({ live: true, limit: 10_000 })) {
    for (const a of watchedAddresses(p)) byAddress.set(a, [...(byAddress.get(a) ?? []), p]);
  }
  index = { at: now, byAddress };
  return byAddress;
}

/** Forget the cache (after a project starts or stops). */
export const invalidateLive = () => {
  index = null;
};

export function watchedAddresses(p: ServerProject): string[] {
  const out: string[] = [];
  if (p.setup.launchMode === "existing" && p.setup.tokenAddress) out.push(p.setup.tokenAddress);
  if (p.setup.launchMode === "existing" && p.setup.walletAddress && p.setup.monitor.wallet) out.push(p.setup.walletAddress);
  return out;
}

// --- parsing -----------------------------------------------------------------

const supplyCache = new Map<string, { at: number; value: number }>();
const SUPPLY_MS = 10 * 60_000;

async function supplyOf(mint: string): Promise<number> {
  const hit = supplyCache.get(mint);
  if (hit && Date.now() - hit.at < SUPPLY_MS) return hit.value;
  const value = await getSupply(mint).catch(() => hit?.value ?? 0);
  supplyCache.set(mint, { at: Date.now(), value });
  return value;
}

/** A project's events in one transaction (honouring its monitor settings). */
export async function projectEvents(tx: RpcTransaction, p: ServerProject): Promise<CircuitEvent[]> {
  const mint = p.setup.tokenAddress;
  const wallet = p.setup.monitor.wallet ? p.setup.walletAddress || undefined : undefined;
  const needsPrice = involvedAddresses(tx).has(mint);
  const [supply, price] = needsPrice ? await Promise.all([supplyOf(mint), getSolUsd()]) : [0, { value: 0 }];
  return filterMonitored(parseTransaction(tx, { mint, wallet, supply, solUsd: price.value }), p);
}

const filterMonitored = (events: CircuitEvent[], p: ServerProject) =>
  events.filter((e) => e.type !== "trade" || p.setup.monitor.trades || p.setup.monitor.volume);

/** Keeps the events this project hasn't run yet, and marks them as run. */
export async function claimNew(db: Db, projectId: string, events: CircuitEvent[]): Promise<CircuitEvent[]> {
  const out: CircuitEvent[] = [];
  for (const e of events) {
    if (!e.proof || (await db.claim(projectId, `${e.proof.signature}:${e.type}`))) out.push(e);
  }
  return out;
}

// --- polling -----------------------------------------------------------------

/**
 * New events for a project since its cursors. The first poll only sets the
 * cursors (going live never replays old activity).
 */
export async function pollProject(p: ServerProject, meta: RunMeta): Promise<{ events: CircuitEvent[]; cursor: RunMeta["cursor"] }> {
  const wallet = p.setup.monitor.wallet ? p.setup.walletAddress || undefined : undefined;
  const r = await pollEvents({ mint: p.setup.tokenAddress, wallet, until: meta.cursor.mint, walletUntil: meta.cursor.wallet, limit: 50 });
  return {
    events: filterMonitored(r.events, p),
    cursor: { mint: r.cursor ?? meta.cursor.mint, wallet: r.walletCursor ?? meta.cursor.wallet },
  };
}

/** Transactions from a webhook body (Helius raw: an array of getTransaction-shaped objects). */
export function webhookTransactions(body: unknown): RpcTransaction[] {
  const list = Array.isArray(body) ? body : [body];
  return list.filter(
    (t): t is RpcTransaction =>
      !!t && typeof t === "object" && Array.isArray((t as RpcTransaction).transaction?.signatures) && Array.isArray((t as RpcTransaction).transaction?.message?.accountKeys),
  );
}
