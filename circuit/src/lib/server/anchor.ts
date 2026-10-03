/**
 * Receipt anchoring: every few minutes, the receipts finished since the last
 * batch are fingerprinted, put in a Merkle tree, and the root is written to
 * Solana in one memo transaction signed by Circuit's anchor key.
 *
 * Off unless CIRCUIT_ANCHOR_KEY is set (a Solana keypair holding a little SOL
 * for fees: each batch costs one network fee, about 0.000005 SOL, however
 * many receipts it holds). Without it, receipts say "not anchored".
 *
 * A batch is claimed (pending), sent (signature recorded), then confirmed. If
 * it never lands, it is marked failed and its receipts go in the next batch.
 */
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { base58Decode, base58Encode, memoMessage, signedTransaction } from "@/lib/chain/keys";
import { getLatestBlockhash, getSignatureStatus, rpcUrl, sendRawTransaction, type Fetcher } from "@/lib/chain/rpc";
import { batchMemo, MEMO_PROGRAM, merkleRoot, receiptLeaf } from "@/lib/proof/proof";
import type { Db } from "./types";

/** Minutes between batches. */
export const BATCH_EVERY_MS = 3 * 60_000;
/** Most receipts in one batch. */
export const BATCH_MAX = 5_000;
/** A sent batch not seen on chain after this long is given up (its blockhash has expired). */
const SEND_TIMEOUT_MS = 3 * 60_000;

export interface AnchorSigner {
  address: string;
  sign(message: Uint8Array): Uint8Array;
}

/** ed25519 PKCS#8 wrapper for a 32-byte seed. */
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/**
 * The anchor key from a Solana keypair: a JSON array of 64 numbers (as
 * `solana-keygen` writes) or base58. Null if missing or malformed.
 */
export function anchorSigner(secret = process.env.CIRCUIT_ANCHOR_KEY): AnchorSigner | null {
  const text = secret?.trim();
  if (!text) return null;
  let bytes: Uint8Array;
  try {
    bytes = text.startsWith("[") ? Uint8Array.from(JSON.parse(text) as number[]) : base58Decode(text);
  } catch {
    return null;
  }
  if (bytes.length !== 64) return null;
  const key = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, Buffer.from(bytes.slice(0, 32))]), format: "der", type: "pkcs8" });
  const publicDer = createPublicKey(key).export({ format: "der", type: "spki" });
  const address = base58Encode(new Uint8Array(publicDer.subarray(publicDer.length - 32)));
  // The keypair's second half must be its public key, or the secret is corrupt.
  if (address !== base58Encode(bytes.slice(32))) return null;
  return { address, sign: (message) => new Uint8Array(sign(null, message, key)) };
}

export const anchoringEnabled = () => !!anchorSigner() && !!rpcUrl();

export interface AnchorResult {
  skipped?: string;
  confirmed: number;
  failed: number;
  sent?: { batchId: number; receipts: number; signature: string };
}

/** One step of the anchoring job; called from the cron tick. Never throws. */
export async function anchorTick(db: Db, opts: { now?: number; fetcher?: Fetcher; signer?: AnchorSigner | null } = {}): Promise<AnchorResult> {
  const now = opts.now ?? Date.now();
  const signer = opts.signer === undefined ? anchorSigner() : opts.signer;
  const result: AnchorResult = { confirmed: 0, failed: 0 };
  if (!signer) return { ...result, skipped: "no anchor key" };
  if (!rpcUrl()) return { ...result, skipped: "no Solana RPC" };

  try {
    // 1. Follow up on batches already sent.
    for (const b of await db.openBatches()) {
      if (b.status === "pending") {
        // Claimed but never sent (the process stopped midway): free its receipts.
        if (now - b.createdAt > SEND_TIMEOUT_MS) {
          await db.releaseBatch(b.id);
          result.failed++;
        }
        continue;
      }
      const status = b.signature ? await getSignatureStatus(b.signature, opts.fetcher).catch(() => undefined) : null;
      if (status === undefined) continue; // RPC trouble: ask again next time
      if (status && !status.err && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
        await db.updateBatch(b.id, { status: "confirmed", slot: status.slot });
        result.confirmed++;
      } else if ((status && status.err) || (!status && now - (b.sentAt ?? b.createdAt) > SEND_TIMEOUT_MS)) {
        await db.releaseBatch(b.id);
        result.failed++;
      }
    }

    // 2. A new batch, if it's time.
    const last = await db.latestBatch();
    if (last && now - last.createdAt < BATCH_EVERY_MS) return { ...result, skipped: "not time yet" };
    const claimed = await db.claimBatch(BATCH_MAX, now);
    if (!claimed) return { ...result, skipped: "no new receipts" };
    const { batch, items } = claimed;
    try {
      const leaves = await Promise.all(items.map((it) => receiptLeaf(it.receipt)));
      const root = await merkleRoot(leaves);
      await db.updateBatch(batch.id, { root, leaves });
      const { blockhash } = await getLatestBlockhash(opts.fetcher);
      const message = memoMessage(signer.address, MEMO_PROGRAM, blockhash, batchMemo(root, leaves.length));
      const raw = signedTransaction(signer.sign(message), message);
      const signature = await sendRawTransaction(Buffer.from(raw).toString("base64"), opts.fetcher);
      await db.updateBatch(batch.id, { status: "sent", signature, sentAt: now });
      return { ...result, sent: { batchId: batch.id, receipts: leaves.length, signature } };
    } catch (e) {
      await db.releaseBatch(batch.id);
      return { ...result, failed: result.failed + 1, skipped: `sending failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  } catch (e) {
    return { ...result, skipped: `anchoring failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
