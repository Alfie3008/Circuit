/**
 * Real chain events for live projects, from two directions:
 * - pushed: Helius webhooks deliver transactions as they land
 * - pulled: the cron polls each project's token and wallet (the fallback when
 *   no webhook is set up, and a periodic safety net when one is)
 * Every event is claimed (signature + type) before it runs, so a transaction
 * that arrives both ways runs once. Claiming is also where the coin's creator
 * fees are counted (AI fuel), from every trade, before events the program
 * doesn't watch are set aside.
 */
import { involvedAddresses, parseTransaction, type RpcTransaction } from "@/lib/chain/parse";
import { getSolUsd, getSupply, pollEvents } from "@/lib/chain/rpc";
import { feesUsd } from "@/lib/fuel";
import type { CircuitEvent } from "@/lib/runtime/events";
import { toNumber } from "@/lib/runtime/values";
import { today } from "./runner";
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

/** A project's events in one transaction (all of them: see `intake`). */
export async function projectEvents(tx: RpcTransaction, p: ServerProject): Promise<CircuitEvent[]> {
  const mint = p.setup.tokenAddress;
  const wallet = p.setup.monitor.wallet ? p.setup.walletAddress || undefined : undefined;
  const needsPrice = involvedAddresses(tx).has(mint);
  const [supply, price] = needsPrice ? await Promise.all([supplyOf(mint), getSolUsd()]) : [0, { value: 0 }];
  return parseTransaction(tx, { mint, wallet, supply, solUsd: price.value });
}

export const filterMonitored = (events: CircuitEvent[], p: ServerProject) =>
  events.filter((e) => e.type !== "trade" || p.setup.monitor.trades || p.setup.monitor.volume);

/** Keeps the events this project hasn't run yet, and marks them as run. */
export async function claimNew(db: Db, projectId: string, events: CircuitEvent[]): Promise<CircuitEvent[]> {
  const out: CircuitEvent[] = [];
  for (const e of events) {
    if (!e.proof || (await db.claim(projectId, `${e.proof.signature}:${e.type}`))) out.push(e);
  }
  return out;
}

/**
 * New chain events for a project: claims them (each runs once), adds the
 * creator fees their trades earned to the project's AI fuel, and returns the
 * ones the program watches. Fee counting never stops a run.
 */
export async function intake(db: Db, p: ServerProject, events: CircuitEvent[], now = Date.now()): Promise<CircuitEvent[]> {
  const fresh = await claimNew(db, p.id, events);
  const sol = fresh
    .filter((e) => e.type === "trade" && e.source === "live" && e.data.token === p.setup.tokenAddress)
    .reduce((s, e) => s + Math.max(0, toNumber(e.data.amount)), 0);
  if (sol > 0) {
    try {
      const usd = feesUsd(sol, (await getSolUsd()).value);
      if (usd > 0) await db.addFees(p.id, today(now), usd);
    } catch (e) {
      console.error("[circuit] couldn't record creator fees", p.id, e);
    }
  }
  return filterMonitored(fresh, p);
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
    events: r.events,
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
