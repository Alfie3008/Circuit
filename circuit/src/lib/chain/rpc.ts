/**
 * Server-only Solana access. This module has no signing keys: the only write
 * is `sendRawTransaction`, which relays a transaction already signed
 * elsewhere (Circuit's proof batches, see lib/server/anchor).
 *
 * RPC endpoint: HELIUS_API_KEY → Helius mainnet; otherwise
 * CIRCUIT_SOLANA_RPC_URL (any Solana RPC, e.g. the public
 * https://api.mainnet-beta.solana.com for slow, rate-limited testing).
 */
import { isAddress, parseTransaction, type RpcTransaction } from "./parse";
import type { CircuitEvent } from "@/lib/runtime/events";

export function rpcUrl(): string | null {
  const helius = process.env.HELIUS_API_KEY?.trim();
  if (helius) return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(helius)}`;
  return process.env.CIRCUIT_SOLANA_RPC_URL?.trim() || null;
}

export const chainProvider = () => (process.env.HELIUS_API_KEY?.trim() ? "helius" : process.env.CIRCUIT_SOLANA_RPC_URL?.trim() ? "custom" : null);

export class ChainError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export type Fetcher = typeof fetch;

let nextId = 1;

/** One JSON-RPC call. `fetcher` is injectable for tests. */
export async function rpc<T>(method: string, params: unknown[] | Record<string, unknown>, fetcher: Fetcher = fetch): Promise<T> {
  const url = rpcUrl();
  if (!url) throw new ChainError("No Solana RPC configured (set HELIUS_API_KEY or CIRCUIT_SOLANA_RPC_URL).", 503);
  let res: Response;
  try {
    res = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
      cache: "no-store",
    });
  } catch {
    throw new ChainError("Couldn't reach the Solana RPC.");
  }
  if (res.status === 429) throw new ChainError("Solana RPC rate limit reached. Slow down polling or upgrade the RPC plan.", 429);
  if (res.status === 401 || res.status === 403) throw new ChainError("The Solana RPC rejected the API key.");
  if (!res.ok) throw new ChainError(`Solana RPC error ${res.status}.`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new ChainError(`Solana RPC: ${body.error.message ?? "unknown error"}`);
  return body.result as T;
}

interface SignatureInfo {
  signature: string;
  slot: number;
  err: unknown;
  blockTime?: number | null;
}

export const getSignatures = (address: string, opts: { until?: string; before?: string; limit?: number }, f?: Fetcher) =>
  rpc<SignatureInfo[]>("getSignaturesForAddress", [address, { commitment: "confirmed", ...opts }], f);

export const getTransaction = (signature: string, f?: Fetcher) =>
  rpc<RpcTransaction | null>("getTransaction", [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }], f);

/** Raw account data (base64-decoded), or null if the account doesn't exist. */
export async function getAccountData(address: string, f?: Fetcher): Promise<Uint8Array | null> {
  const r = await rpc<{ value: { data: [string, string] } | null }>("getAccountInfo", [address, { encoding: "base64", commitment: "confirmed" }], f);
  return r.value ? Uint8Array.from(Buffer.from(r.value.data[0], "base64")) : null;
}

export async function getLatestBlockhash(f?: Fetcher): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const r = await rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>("getLatestBlockhash", [{ commitment: "confirmed" }], f);
  return r.value;
}

/** Relays a signed transaction (base64). Returns its signature. */
export const sendRawTransaction = (base64: string, f?: Fetcher) =>
  rpc<string>("sendTransaction", [base64, { encoding: "base64", preflightCommitment: "confirmed", maxRetries: 3 }], f);

export interface SignatureStatus {
  slot: number;
  err: unknown;
  confirmationStatus?: "processed" | "confirmed" | "finalized";
}
export async function getSignatureStatus(signature: string, f?: Fetcher): Promise<SignatureStatus | null> {
  const r = await rpc<{ value: (SignatureStatus | null)[] }>("getSignatureStatuses", [[signature], { searchTransactionHistory: true }], f);
  return r.value[0] ?? null;
}

export async function getSolBalance(address: string, f?: Fetcher): Promise<number> {
  const r = await rpc<{ value: number }>("getBalance", [address, { commitment: "confirmed" }], f);
  return r.value / 1e9;
}

const supplyCache = new Map<string, { value: number; at: number }>();
/** Total token supply in UI units (cached 10 minutes). */
export async function getSupply(mint: string, f?: Fetcher): Promise<number> {
  const hit = supplyCache.get(mint);
  if (hit && Date.now() - hit.at < 600_000) return hit.value;
  const r = await rpc<{ value: { amount: string; decimals: number } }>("getTokenSupply", [mint], f);
  const value = Number(r.value.amount) / 10 ** r.value.decimals;
  supplyCache.set(mint, { value, at: Date.now() });
  return value;
}

let solUsdCache: { value: number; at: number; source: string } | null = null;
/** SOL price in USD from Jupiter (cached 60s); falls back to CIRCUIT_SOL_USD or 170. */
export async function getSolUsd(f: Fetcher = fetch): Promise<{ value: number; source: string }> {
  if (solUsdCache && Date.now() - solUsdCache.at < 60_000) return solUsdCache;
  try {
    const res = await f("https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112", { cache: "no-store" });
    const body = (await res.json()) as Record<string, { usdPrice?: number; price?: number | string }>;
    const entry = body["So11111111111111111111111111111111111111112"];
    const value = Number(entry?.usdPrice ?? entry?.price);
    if (Number.isFinite(value) && value > 0) {
      solUsdCache = { value, at: Date.now(), source: "jupiter" };
      return solUsdCache;
    }
  } catch {
    // fall through to the configured price
  }
  const value = Number(process.env.CIRCUIT_SOL_USD) || 170;
  return { value, source: "assumed" };
}

/** Runs `fn` over items with at most `n` in flight. */
export async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

export interface EventsResult {
  events: CircuitEvent[];
  /** Newest mint signature seen: pass back as `until` next time. */
  cursor: string | null;
  /** Newest watched-wallet signature seen: pass back as `walletUntil`. */
  walletCursor?: string | null;
  scanned: number;
}

async function eventsFor(sigs: SignatureInfo[], mint: string, wallet: string | undefined, f?: Fetcher): Promise<CircuitEvent[]> {
  if (!sigs.length) return [];
  const [supply, price] = await Promise.all([getSupply(mint, f).catch(() => 0), getSolUsd(f)]);
  const ok = sigs.filter((s) => !s.err);
  const txs = await pool(ok, 6, (s) => getTransaction(s.signature, f).catch(() => null));
  return txs
    .flatMap((tx) => (tx ? parseTransaction(tx, { mint, wallet, supply, solUsd: price.value }) : []))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * New events since the cursors (oldest first). Without a cursor, returns no
 * events and the current cursor, so going live never replays old activity.
 */
export async function pollEvents(
  opts: { mint: string; wallet?: string; until?: string; walletUntil?: string; limit?: number },
  f?: Fetcher,
): Promise<EventsResult> {
  if (!isAddress(opts.mint)) throw new ChainError("That isn't a Solana token address.", 400);
  if (opts.wallet && !isAddress(opts.wallet)) throw new ChainError("That isn't a Solana wallet address.", 400);
  const limit = Math.min(opts.limit ?? 25, 50);

  const sigs = await getSignatures(opts.mint, { until: opts.until, limit }, f);
  const cursor = sigs[0]?.signature ?? opts.until ?? null;
  const events = opts.until ? await eventsFor(sigs, opts.mint, opts.wallet, f) : [];

  let walletCursor: string | null | undefined;
  if (opts.wallet) {
    const wsigs = await getSignatures(opts.wallet, { until: opts.walletUntil, limit }, f);
    walletCursor = wsigs[0]?.signature ?? opts.walletUntil ?? null;
    if (opts.walletUntil) {
      // Payments that didn't touch the mint (those were parsed above already).
      const seen = new Set(sigs.map((s) => s.signature));
      const fresh = wsigs.filter((s) => !seen.has(s.signature));
      events.push(...(await eventsFor(fresh, opts.mint, opts.wallet, f)).filter((e) => e.type === "wallet_receives"));
      events.sort((a, b) => a.timestamp - b.timestamp);
    }
  }
  return { events, cursor, walletCursor, scanned: sigs.length };
}

/** Holder count via Helius DAS getTokenAccounts (Helius only). Capped at 20 pages. */
export async function holderCount(mint: string, f?: Fetcher): Promise<{ holders: number; capped: boolean }> {
  if (chainProvider() !== "helius") throw new ChainError("Holder counts need a Helius key (DAS API).", 501);
  if (!isAddress(mint)) throw new ChainError("That isn't a Solana token address.", 400);
  const owners = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const r = await rpc<{ token_accounts?: { owner: string; amount: number | string }[] }>(
      "getTokenAccounts",
      { mint, page, limit: 1000 }, // DAS methods take named params
      f,
    );
    const accounts = r.token_accounts ?? [];
    for (const a of accounts) if (Number(a.amount) > 0) owners.add(a.owner);
    if (accounts.length < 1000) return { holders: owners.size, capped: false };
  }
  return { holders: owners.size, capped: true };
}
