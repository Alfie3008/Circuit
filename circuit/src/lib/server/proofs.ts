/**
 * Phase 8, proof on Solana, on the server:
 * - the creator check: the wallet publishing a coin's program created the coin
 * - rules versions: the owner's wallet writes the rules fingerprint in a memo;
 *   the server reads that transaction back and records it as a version
 * - receipt proofs: where a receipt sits in an anchored batch
 */
import { coinCreator, type CoinCreator } from "@/lib/chain/creator";
import { memosOf, signerOf } from "@/lib/chain/parse";
import { chainProvider, getTransaction, type Fetcher } from "@/lib/chain/rpc";
import { merkleProof, rulesFingerprint, rulesMemo, type ProofStep } from "@/lib/proof/proof";
import { ServerError, type Db, type ProofBatch, type ProjectProof, type RulesVersion, type ServerProject } from "./types";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export type CreatorLookup = (mint: string) => Promise<CoinCreator>;

/**
 * Checks that `owner` created `mint`. Returns what to record (null when no
 * chain is configured, so nothing can be checked). Throws a plain message if
 * someone else created it, or if Solana can't be reached right now.
 */
export async function checkCreator(mint: string, owner: string, lookup: CreatorLookup = (m) => coinCreator(m), now = Date.now()): Promise<ProjectProof["creator"]> {
  if (!chainProvider()) return null;
  let found: CoinCreator;
  try {
    found = await lookup(mint);
  } catch (e) {
    throw new ServerError(`Couldn't check who created this coin right now (${e instanceof Error ? e.message : String(e)}). Try again in a minute.`, 503);
  }
  if (!found.creator) return null; // not findable (e.g. a very old, very busy token): published as unverified
  if (found.creator !== owner)
    throw new ServerError(`This coin was created by ${short(found.creator)}, not the wallet you're signed in with (${short(owner)}). Sign in with the wallet that created the coin.`, 403);
  return { mint, wallet: owner, source: found.source ?? "unknown", checkedAt: now };
}

/** Waits for a transaction to be readable (it can take a few seconds after sending). */
async function readTx(signature: string, f?: Fetcher, tries = 4, waitMs = 1500) {
  for (let i = 0; i < tries; i++) {
    const tx = await getTransaction(signature, f).catch(() => null);
    if (tx) return tx;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, waitMs));
  }
  return null;
}

/**
 * Records a rules version from the owner's memo transaction, after checking on
 * Solana that it is real, signed by the owner, and carries this project's
 * current fingerprint.
 */
export async function recordRules(db: Db, owner: string, id: string, signature: string, opts: { fetcher?: Fetcher; tries?: number; waitMs?: number } = {}): Promise<RulesVersion> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) throw new ServerError("That isn't a transaction signature.");
  if (!chainProvider()) throw new ServerError("This server has no Solana connection, so it can't check the transaction.", 503);
  const project = await db.getProject(id);
  if (!project) throw new ServerError("That project isn't published.", 404);
  if (project.owner !== owner) throw new ServerError("This project belongs to another wallet.", 403);
  const fingerprint = await rulesFingerprint(project.program);
  const versions = project.proof?.rules ?? [];
  const already = versions.find((v) => v.signature === signature);
  if (already) return already;

  const tx = await readTx(signature, opts.fetcher, opts.tries, opts.waitMs);
  if (!tx) throw new ServerError("Solana hasn't confirmed that transaction yet. Wait a few seconds and try again.", 409);
  if (tx.meta?.err) throw new ServerError("That transaction failed on Solana, so nothing was written.");
  if (signerOf(tx) !== owner) throw new ServerError("That transaction wasn't signed by this project's wallet.", 403);
  if (!memosOf(tx).includes(rulesMemo(project.slug, fingerprint)))
    throw new ServerError("That transaction doesn't carry this project's current rules fingerprint. Publish first, then write the fingerprint.");

  const version: RulesVersion = { version: (versions.at(-1)?.version ?? 0) + 1, fingerprint, signature, slot: tx.slot, at: (tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000 };
  project.proof = { ...project.proof, rules: [...versions, version] };
  await db.saveProject(project);
  return version;
}

export interface ReceiptProof {
  batch: Pick<ProofBatch, "id" | "root" | "status" | "signature" | "slot" | "createdAt">;
  index: number;
  proof: ProofStep[];
}

/** Where a project's receipt sits in a batch, and its path to the root. Null if not in a batch yet. */
export async function receiptProof(db: Db, project: ServerProject, receiptId: number): Promise<ReceiptProof | null> {
  const anchor = (await db.receiptAnchors(project.id, [receiptId]))[receiptId];
  if (!anchor) return null;
  const batch = await db.getBatch(anchor.batchId);
  if (!batch || !batch.root || batch.status === "failed") return null;
  const { id, root, status, signature, slot, createdAt } = batch;
  return { batch: { id, root, status, signature, slot, createdAt }, index: anchor.index, proof: await merkleProof(batch.leaves, anchor.index) };
}
