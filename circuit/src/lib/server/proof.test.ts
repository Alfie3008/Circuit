/** Phase 8: proof on Solana (Merkle proofs, anchoring, rules versions, creator check), against a fake RPC. */
import { Keypair, Transaction } from "@solana/web3.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Fetcher } from "@/lib/chain/rpc";
import { parseProgram, type Program } from "@/lib/ir";
import { batchMemo, merkleProof, merkleRoot, parseMemo, receiptLeaf, rulesFingerprint, rulesMemo, sha256Text, verifyProof } from "@/lib/proof/proof";
import { DEFAULT_SETUP } from "@/lib/project/storage";
import type { Receipt } from "@/lib/runtime/state";
import { anchorSigner, anchorTick, BATCH_EVERY_MS } from "./anchor";
import { memoryDb } from "./memoryDb";
import { publish } from "./projects";
import { receiptProof, recordRules } from "./proofs";
import { ServerError, type Db } from "./types";

const T0 = Date.UTC(2026, 9, 3, 12, 0);
const OWNER = Keypair.generate().publicKey.toBase58();
const MINT = Keypair.generate().publicKey.toBase58();
const SIG = (n: number) => `${"5".repeat(80)}${n}`.slice(0, 88);

function rpc(handlers: Record<string, (params: unknown) => unknown>) {
  const calls: { method: string; params: unknown }[] = [];
  const f: Fetcher = async (_url, init) => {
    const { method, params } = JSON.parse(String(init?.body));
    calls.push({ method, params });
    const h = handlers[method];
    if (!h) return Response.json({ jsonrpc: "2.0", id: 1, error: { message: `no ${method}` } });
    try {
      return Response.json({ jsonrpc: "2.0", id: 1, result: h(params) });
    } catch (e) {
      return Response.json({ jsonrpc: "2.0", id: 1, error: { message: (e as Error).message } });
    }
  };
  return { f, calls };
}

const receipt = (id: number, finished = true): Receipt => ({
  id,
  startedAt: T0 + id,
  finishedAt: finished ? T0 + id + 1 : null,
  event: { type: "trade", label: "Trade", source: "live", data: { amount: id } },
  status: "complete",
  error: null,
  steps: 1,
  entries: [],
  rules: "ab".repeat(32),
});

const program = (): Program => {
  const r = parseProgram({ version: 1, scripts: [{ event: { type: "button" }, body: [{ type: "update_feed", message: "hi" }] }] });
  if (!r.ok) throw new Error("bad");
  return r.program;
};

async function seed(db: Db, id = "p1") {
  await db.saveProject({ id, slug: id, owner: OWNER, name: id, program: program(), setup: { ...DEFAULT_SETUP }, live: true, timezone: "UTC", createdAt: T0, updatedAt: T0 });
}

beforeEach(() => vi.stubEnv("CIRCUIT_SOLANA_RPC_URL", "https://rpc.example"));
afterEach(() => vi.unstubAllEnvs());

describe("fingerprints and Merkle proofs", () => {
  it("every leaf of every tree size proves into its root; a changed receipt doesn't", async () => {
    for (let n = 1; n <= 17; n++) {
      const leaves = await Promise.all(Array.from({ length: n }, (_, i) => sha256Text(`leaf ${i}`)));
      const root = await merkleRoot(leaves);
      for (let i = 0; i < n; i++) expect(await verifyProof(leaves[i], await merkleProof(leaves, i), root)).toBe(true);
      if (n > 1) expect(await verifyProof(await sha256Text("forged"), await merkleProof(leaves, 0), root)).toBe(false);
    }
    const r = receipt(1);
    expect(await receiptLeaf(r)).toBe(await receiptLeaf({ ...r, entries: [] })); // key order doesn't matter
    expect(await receiptLeaf(r)).not.toBe(await receiptLeaf({ ...r, steps: 2 }));
  });

  it("memos round-trip", () => {
    const fp = "cd".repeat(32);
    expect(parseMemo(rulesMemo("my-coin", fp))).toEqual({ kind: "rules", slug: "my-coin", fingerprint: fp });
    expect(parseMemo(batchMemo(fp, 12))).toEqual({ kind: "batch", root: fp, count: 12 });
    expect(parseMemo("hello")).toBeNull();
  });
});

describe("anchoring receipts", () => {
  it("batches finished receipts, writes the root in a signed memo, confirms it, and proves each receipt", async () => {
    const db = memoryDb();
    await seed(db);
    await db.addReceipts("p1", [receipt(1), receipt(2), receipt(3), receipt(4, false)]);
    const key = Keypair.generate();
    const signer = anchorSigner(JSON.stringify([...key.secretKey]))!;
    let sent: Transaction | null = null;
    let status: unknown = null;
    const { f } = rpc({
      getLatestBlockhash: () => ({ value: { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 1 } }),
      sendTransaction: (p) => {
        sent = Transaction.from(Buffer.from((p as [string])[0], "base64"));
        return SIG(1);
      },
      getSignatureStatuses: () => ({ value: [status] }),
    });

    const first = await anchorTick(db, { now: T0, fetcher: f, signer });
    expect(first.sent).toMatchObject({ receipts: 3, signature: SIG(1) }); // the unfinished receipt waits
    const tx = sent as unknown as Transaction;
    expect(tx.verifySignatures()).toBe(true);
    expect(tx.feePayer!.toBase58()).toBe(key.publicKey.toBase58());
    const memo = parseMemo(tx.instructions[0].data.toString("utf8"));
    expect(memo).toMatchObject({ kind: "batch", count: 3 });

    // Not landed yet: nothing changes. Then confirmed.
    expect((await anchorTick(db, { now: T0 + 10_000, fetcher: f, signer })).confirmed).toBe(0);
    status = { slot: 77, err: null, confirmationStatus: "confirmed" };
    expect((await anchorTick(db, { now: T0 + 20_000, fetcher: f, signer })).confirmed).toBe(1);

    // Each receipt proves into the root written on chain.
    const project = (await db.getProject("p1"))!;
    for (const id of [1, 2, 3]) {
      const p = (await receiptProof(db, project, id))!;
      expect(p.batch).toMatchObject({ status: "confirmed", slot: 77, signature: SIG(1) });
      expect(p.batch.root).toBe((memo as { root: string }).root);
      expect(await verifyProof(await receiptLeaf(receipt(id)), p.proof, p.batch.root)).toBe(true);
    }
    expect(await receiptProof(db, project, 4)).toBeNull();
    // Anchored receipts are final.
    await db.addReceipts("p1", [{ ...receipt(1), steps: 99 }]);
    expect((await db.listReceipts("p1", 10)).find((r) => r.id === 1)!.steps).toBe(1);
  });

  it("waits between batches, and a batch that fails to send frees its receipts for the next", async () => {
    const db = memoryDb();
    await seed(db);
    await db.addReceipts("p1", [receipt(1)]);
    const signer = anchorSigner(JSON.stringify([...Keypair.generate().secretKey]))!;
    let fail = true;
    const { f } = rpc({
      getLatestBlockhash: () => ({ value: { blockhash: Keypair.generate().publicKey.toBase58(), lastValidBlockHeight: 1 } }),
      sendTransaction: () => {
        if (fail) throw new Error("blockhash not found");
        return SIG(2);
      },
      getSignatureStatuses: () => ({ value: [null] }),
    });
    const r1 = await anchorTick(db, { now: T0, fetcher: f, signer });
    expect(r1.failed).toBe(1);
    fail = false;
    expect((await anchorTick(db, { now: T0 + 1000, fetcher: f, signer })).skipped).toBe("not time yet");
    const r2 = await anchorTick(db, { now: T0 + BATCH_EVERY_MS + 1, fetcher: f, signer });
    expect(r2.sent).toMatchObject({ receipts: 1 });
    // Never lands: given up after the timeout, and the same tick puts the receipt in a new batch.
    const r3 = await anchorTick(db, { now: T0 + 2 * BATCH_EVERY_MS + 5000, fetcher: f, signer });
    expect(r3.failed).toBe(1);
    expect(r3.sent).toMatchObject({ receipts: 1 });
  });

  it("is off without a key, and rejects a corrupt key", async () => {
    expect((await anchorTick(memoryDb(), { signer: null })).skipped).toBe("no anchor key");
    const bad = [...Keypair.generate().secretKey];
    bad[40] ^= 1;
    expect(anchorSigner(JSON.stringify(bad))).toBeNull();
    expect(anchorSigner("not a key")).toBeNull();
  });
});

describe("rules versions", () => {
  const memoTx = (memo: string, signer = OWNER, err: unknown = null) => ({
    slot: 900,
    blockTime: T0 / 1000,
    meta: { err, fee: 5000, preBalances: [], postBalances: [], logMessages: [] },
    transaction: { signatures: [SIG(3)], message: { accountKeys: [{ pubkey: signer, signer: true }], instructions: [{ program: "spl-memo", programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", parsed: memo }] } },
  });

  it("records a version only from the owner's memo carrying the current fingerprint", async () => {
    const db = memoryDb();
    await seed(db);
    const fp = await rulesFingerprint(program());
    let tx: unknown = memoTx(rulesMemo("p1", fp));
    const { f } = rpc({ getTransaction: () => tx });
    const opts = { fetcher: f, tries: 1 };

    const v1 = await recordRules(db, OWNER, "p1", SIG(3), opts);
    expect(v1).toMatchObject({ version: 1, fingerprint: fp, slot: 900 });
    expect(await recordRules(db, OWNER, "p1", SIG(3), opts)).toEqual(v1); // same transaction again: same version
    expect((await db.getProject("p1"))!.proof!.rules).toHaveLength(1);

    tx = memoTx(rulesMemo("p1", fp), Keypair.generate().publicKey.toBase58());
    await expect(recordRules(db, OWNER, "p1", SIG(4), opts)).rejects.toMatchObject({ status: 403 });
    tx = memoTx(rulesMemo("p1", "00".repeat(32)));
    await expect(recordRules(db, OWNER, "p1", SIG(4), opts)).rejects.toThrow(/current rules fingerprint/);
    tx = memoTx(rulesMemo("p1", fp), OWNER, { InstructionError: [0, "x"] });
    await expect(recordRules(db, OWNER, "p1", SIG(4), opts)).rejects.toThrow(/failed/);
    tx = null;
    await expect(recordRules(db, OWNER, "p1", SIG(4), opts)).rejects.toMatchObject({ status: 409 });
    await expect(recordRules(db, "someone-else", "p1", SIG(4), opts)).rejects.toMatchObject({ status: 403 });
  });
});

describe("creator check on publish", () => {
  const body = (mint = MINT) => ({ id: "coin1", name: "Coin", slug: "coin1", program: program(), setup: { ...DEFAULT_SETUP, launchMode: "existing", tokenAddress: mint } });

  it("only the wallet that created the coin can publish its page", async () => {
    const db = memoryDb();
    const other = Keypair.generate().publicKey.toBase58();
    await expect(publish(db, OWNER, body(), T0, { creatorLookup: async () => ({ creator: other, source: "pump.fun" }) })).rejects.toMatchObject({ status: 403 });
    const p = await publish(db, OWNER, body(), T0, { creatorLookup: async () => ({ creator: OWNER, source: "pump.fun" }) });
    expect(p.proof?.creator).toMatchObject({ mint: MINT, wallet: OWNER, source: "pump.fun" });
    // Checked once per coin: republishing doesn't ask Solana again.
    const again = await publish(db, OWNER, body(), T0 + 1, { creatorLookup: async () => Promise.reject(new Error("should not be called")) });
    expect(again.proof?.creator?.wallet).toBe(OWNER);
  });

  it("an unreachable chain is a plain, retryable error; no chain configured skips the check", async () => {
    await expect(publish(memoryDb(), OWNER, body(), T0, { creatorLookup: async () => Promise.reject(new Error("timeout")) })).rejects.toBeInstanceOf(ServerError);
    vi.stubEnv("CIRCUIT_SOLANA_RPC_URL", "");
    vi.stubEnv("HELIUS_API_KEY", "");
    const p = await publish(memoryDb(), OWNER, body(), T0, { creatorLookup: async () => Promise.reject(new Error("unused")) });
    expect(p.proof?.creator).toBeNull();
  });
});
