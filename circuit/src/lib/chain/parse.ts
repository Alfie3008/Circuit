/**
 * Turns standard Solana JSON-RPC transactions (getTransaction, or Helius
 * "raw" webhooks, which use the same shape) into normalized CIRCUIT events.
 *
 * Trades are read from balance changes, not from program-specific
 * instructions: the signer's token balance for the mint went up (buy) or down
 * (sell), and their SOL (plus wrapped SOL) moved the other way. That works the
 * same on the pump.fun bonding curve, after graduation, and on any DEX.
 */
import type { CircuitEvent, Proof } from "@/lib/runtime/events";

export const LAMPORTS_PER_SOL = 1_000_000_000;
export const WSOL_MINT = "So11111111111111111111111111111111111111112";
/** pump.fun bonding-curve program. */
export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number; uiAmount?: number | null; uiAmountString?: string };
}

type AccountKey = string | { pubkey: string; signer?: boolean; writable?: boolean };

/** The parts of a getTransaction result we read. */
export interface RpcTransaction {
  slot: number;
  blockTime?: number | null;
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    logMessages?: string[] | null;
    /** Address-lookup-table accounts ("json" encoding lists them here, not in accountKeys). */
    loadedAddresses?: { writable: string[]; readonly: string[] } | null;
  } | null;
  transaction: {
    signatures: string[];
    message: { accountKeys: AccountKey[] };
  };
}

export const solscanTx = (signature: string) => `https://solscan.io/tx/${signature}`;
export const solscanAccount = (address: string) => `https://solscan.io/account/${address}`;

const key = (k: AccountKey) => (typeof k === "string" ? k : k.pubkey);

/** Every account, in balance order (static keys, then lookup-table ones if listed separately). */
export function accountKeys(tx: RpcTransaction): string[] {
  const keys = tx.transaction.message.accountKeys.map(key);
  const loaded = tx.meta?.loadedAddresses;
  if (loaded && keys.length < (tx.meta?.preBalances.length ?? 0)) keys.push(...loaded.writable, ...loaded.readonly);
  return keys;
}

/** Addresses a transaction involves: accounts, plus mints and owners of token balances. */
export function involvedAddresses(tx: RpcTransaction): Set<string> {
  const out = new Set(accountKeys(tx));
  for (const b of [...(tx.meta?.preTokenBalances ?? []), ...(tx.meta?.postTokenBalances ?? [])]) {
    out.add(b.mint);
    if (b.owner) out.add(b.owner);
  }
  return out;
}
const round = (n: number, places = 9) => Math.round(n * 10 ** places) / 10 ** places;

/** UI-unit change in `owner`'s balance of `mint` across the transaction. */
function tokenDelta(tx: RpcTransaction, mint: string, owner: string): number {
  const sum = (list: TokenBalance[] | undefined) =>
    (list ?? [])
      .filter((b) => b.mint === mint && b.owner === owner)
      .reduce((s, b) => s + Number(b.uiTokenAmount.amount) / 10 ** b.uiTokenAmount.decimals, 0);
  return sum(tx.meta?.postTokenBalances) - sum(tx.meta?.preTokenBalances);
}

const shortAddr = (a: string) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

export interface ParseOptions {
  mint: string;
  /** Also report SOL arriving at this wallet (creator / treasury). */
  wallet?: string;
  /** Total token supply in UI units, for market cap. */
  supply?: number;
  /** SOL price in USD, for market cap. */
  solUsd?: number;
}

/**
 * Events in one transaction: a trade of `mint`, SOL received by `wallet`,
 * and pump.fun graduation. Failed transactions produce nothing.
 */
export function parseTransaction(tx: RpcTransaction, opts: ParseOptions): CircuitEvent[] {
  if (!tx.meta || tx.meta.err) return [];
  const keys = accountKeys(tx);
  const signer = keys[0];
  const signature = tx.transaction.signatures[0];
  const timestamp = (tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000;
  const proof: Proof = { signature, slot: tx.slot, explorer: solscanTx(signature) };
  const live = (type: CircuitEvent["type"], data: CircuitEvent["data"]): CircuitEvent => ({ type, source: "live", timestamp, data, proof });
  const events: CircuitEvent[] = [];

  // Trade: the signer's balance of the mint changed.
  const tokens = tokenDelta(tx, opts.mint, signer);
  if (Math.abs(tokens) > 0) {
    // SOL that left (buy) or arrived (sell), excluding the network fee, plus wrapped SOL.
    const lamports = tx.meta.postBalances[0] - tx.meta.preBalances[0] + tx.meta.fee;
    const sol = Math.abs(lamports / LAMPORTS_PER_SOL + tokenDelta(tx, WSOL_MINT, signer));
    const side = tokens > 0 ? "buy" : "sell";
    const data: CircuitEvent["data"] = {
      amount: round(sol, 6),
      side,
      wallet: shortAddr(signer),
      walletAddress: signer,
      token: opts.mint,
      tokenAmount: round(Math.abs(tokens), 6),
    };
    if (sol > 0 && opts.supply && opts.solUsd) data.marketCap = Math.round((sol / Math.abs(tokens)) * opts.supply * opts.solUsd);
    events.push(live("trade", data));
  }

  // SOL arriving at the watched wallet from someone else.
  if (opts.wallet && opts.wallet !== signer) {
    const i = keys.indexOf(opts.wallet);
    if (i > 0) {
      const received = (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / LAMPORTS_PER_SOL;
      if (received > 0) events.push(live("wallet_receives", { wallet: opts.wallet, amount: round(received, 6), from: shortAddr(signer) }));
    }
  }

  // pump.fun migration (graduation) instruction.
  const logs = tx.meta.logMessages ?? [];
  if (logs.some((l) => l.includes(PUMP_PROGRAM)) && logs.some((l) => /Instruction: Migrate/i.test(l)) && keys.includes(opts.mint))
    events.push(live("token_graduates", { token: opts.mint }));

  return events;
}

/** Base58 Solana address (32–44 chars). */
export const isAddress = (s: unknown): s is string => typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

/**
 * Memo texts in a transaction, from parsed instructions ("jsonParsed"
 * encoding) or, failing that, the Memo program's log lines.
 */
export function memosOf(tx: RpcTransaction): string[] {
  const out: string[] = [];
  const message = tx.transaction.message as RpcTransaction["transaction"]["message"] & { instructions?: { program?: string; programId?: string; parsed?: unknown }[] };
  for (const ix of message.instructions ?? []) if ((ix.program === "spl-memo" || ix.programId === MEMO_PROGRAM_ID) && typeof ix.parsed === "string") out.push(ix.parsed);
  if (out.length) return out;
  for (const line of tx.meta?.logMessages ?? []) {
    const m = /^Program log: Memo \(len \d+\): "(.*)"$/.exec(line);
    if (m) out.push(m[1].replace(/\\"/g, '"'));
  }
  return out;
}
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/** The fee payer (first signer) of a transaction. */
export const signerOf = (tx: RpcTransaction) => accountKeys(tx)[0];
