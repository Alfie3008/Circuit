/**
 * Who created a coin. For pump.fun coins it is written in the coin's bonding
 * curve account (the `creator` field, which also receives creator fees). For
 * anything else, or older curves without the field, it is the signer of the
 * mint's first transaction.
 */
import { addressBytes, base58Encode, findProgramAddress } from "./keys";
import { getAccountData, getSignatures, getTransaction, type Fetcher } from "./rpc";
import { isAddress, PUMP_PROGRAM, signerOf } from "./parse";

/** Bonding curve layout: 8 discriminator, 5 × u64 reserves/supply, 1 bool complete, then the creator. */
const CREATOR_OFFSET = 8 + 5 * 8 + 1;
/** Pages of 1,000 signatures walked back to find a mint's first transaction. */
const MAX_PAGES = 10;

export interface CoinCreator {
  creator: string | null;
  source: "pump.fun" | "first transaction" | null;
}

export function bondingCurveAddress(mint: string): string {
  return findProgramAddress([Buffer.from("bonding-curve"), addressBytes(mint)], PUMP_PROGRAM);
}

export async function coinCreator(mint: string, f?: Fetcher): Promise<CoinCreator> {
  if (!isAddress(mint)) return { creator: null, source: null };

  const data = await getAccountData(bondingCurveAddress(mint), f);
  if (data && data.length >= CREATOR_OFFSET + 32) {
    const bytes = data.slice(CREATOR_OFFSET, CREATOR_OFFSET + 32);
    if (bytes.some((b) => b !== 0)) return { creator: base58Encode(bytes), source: "pump.fun" };
  }

  // Not a pump.fun curve (or no creator recorded): the first transaction's signer.
  let before: string | undefined;
  let oldest: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const sigs = await getSignatures(mint, { before, limit: 1000 }, f);
    if (!sigs.length) break;
    oldest = sigs[sigs.length - 1].signature;
    if (sigs.length < 1000 || oldest === before) {
      const tx = await getTransaction(oldest, f);
      return tx ? { creator: signerOf(tx), source: "first transaction" } : { creator: null, source: null };
    }
    before = oldest;
  }
  return { creator: null, source: null };
}
