/**
 * Browser side of the chain routes: status, live polling and the chain
 * adapter used by blocks like WALLET BALANCE.
 */
import { errorText, guardedGet } from "@/lib/ai/client";
import type { ChainAdapter, HttpResult, Page, WebAdapter } from "@/lib/runtime/adapters";
import type { CircuitEvent } from "@/lib/runtime/events";
import { isAddress } from "./parse";

export interface ChainStatus {
  enabled: boolean;
  provider: "helius" | "custom" | null;
  holders: boolean;
}

export async function fetchChainStatus(): Promise<ChainStatus | null> {
  try {
    const res = await fetch("/api/chain/status", { cache: "no-store" });
    return res.ok ? ((await res.json()) as ChainStatus) : null;
  } catch {
    return null;
  }
}

export interface PollResult {
  events: CircuitEvent[];
  cursor: string | null;
  walletCursor?: string | null;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await guardedGet(url);
  if (!res.ok) throw new Error(await errorText(res));
  return (await res.json()) as T;
}

export function pollChain(opts: { mint: string; wallet?: string; until?: string | null; walletUntil?: string | null }): Promise<PollResult> {
  const q = new URLSearchParams({ mint: opts.mint });
  if (opts.wallet) q.set("wallet", opts.wallet);
  if (opts.until) q.set("until", opts.until);
  if (opts.walletUntil) q.set("walletUntil", opts.walletUntil);
  return getJson<PollResult>(`/api/chain/events?${q}`);
}

export function fetchHolders(mint: string) {
  return getJson<{ holders: number; capped: boolean }>(`/api/chain/holders?${new URLSearchParams({ mint })}`);
}

/**
 * The web in the builder: pages and GET requests are real (read through the
 * server's safe fetcher); sending (POST, webhooks) is simulated so testing a
 * program never spams anyone; search is simulated until a search API is set.
 */
export function remoteWeb(mock: WebAdapter): WebAdapter {
  let label = "web";
  return {
    get label() {
      return label;
    },
    async search(query) {
      label = "simulated search (no search API connected yet)";
      return mock.search(query);
    },
    async open(url) {
      label = "web";
      return getJson<Page>(`/api/web/open?${new URLSearchParams({ url })}`);
    },
    async request(method, url, headers, body) {
      if (method.toUpperCase() !== "GET") {
        label = "simulated in the builder (sent for real once your coin is live)";
        return mock.request(method, url, headers, body);
      }
      label = "web";
      return getJson<HttpResult>(`/api/web/get?${new URLSearchParams({ url, headers: JSON.stringify(headers) })}`);
    },
  };
}

/**
 * Real balances for real addresses; anything that isn't a Solana address
 * (a name like "alice") keeps the simulated balance.
 */
export function remoteChain(mock: ChainAdapter): ChainAdapter {
  let label = "solana";
  return {
    get label() {
      return label;
    },
    async balance(wallet) {
      if (!isAddress(wallet)) {
        label = "simulated (not a Solana address)";
        return mock.balance(wallet);
      }
      try {
        const { sol } = await getJson<{ sol: number }>(`/api/chain/balance?${new URLSearchParams({ wallet })}`);
        label = "solana";
        return sol;
      } catch (e) {
        label = `unavailable (${e instanceof Error ? e.message : "error"})`;
        return null;
      }
    },
    async tokenBalance(wallet, mint) {
      if (!isAddress(wallet) || !isAddress(mint)) {
        label = "simulated (not a Solana address)";
        return mock.tokenBalance(wallet, mint);
      }
      try {
        const { tokens } = await getJson<{ tokens: number }>(`/api/chain/balance?${new URLSearchParams({ wallet, mint })}`);
        label = "solana";
        return tokens;
      } catch (e) {
        label = `unavailable (${e instanceof Error ? e.message : "error"})`;
        return null;
      }
    },
  };
}
