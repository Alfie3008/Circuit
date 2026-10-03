/**
 * Verify, in the browser: everything is recomputed here, and transactions are
 * read from Solana's public RPC directly. Circuit's server is only a fallback
 * for reading a transaction (if the public RPC is busy), and the result says so.
 */
import { memosOf, signerOf, type RpcTransaction } from "@/lib/chain/parse";
import type { Receipt } from "@/lib/runtime/state";
import type { RulesVersion } from "@/lib/server/types";
import { batchMemo, receiptLeaf, rulesFingerprint, rulesMemo, verifyProof, type ProofStep } from "./proof";

const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";

export interface ChainTx {
  signature: string;
  signer: string;
  memos: string[];
  failed: boolean;
  /** Who answered: Solana's public RPC, or Circuit's server as a fallback. */
  via: "solana" | "circuit";
}

async function fromPublicRpc(signature: string): Promise<ChainTx | null> {
  const res = await fetch(PUBLIC_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }] }),
  });
  if (!res.ok) throw new Error(`public RPC ${res.status}`);
  const body = (await res.json()) as { result?: RpcTransaction | null; error?: unknown };
  if (body.error) throw new Error("public RPC error");
  const tx = body.result;
  return tx ? { signature, signer: signerOf(tx), memos: memosOf(tx), failed: !!tx.meta?.err, via: "solana" } : null;
}

/** Reads a proof transaction: public RPC first, then this project's server endpoint. */
export async function readProofTx(slug: string, signature: string, which: { receipt: number } | { version: number }): Promise<ChainTx | null> {
  try {
    const tx = await fromPublicRpc(signature);
    if (tx) return tx;
  } catch {
    // busy or blocked: fall back
  }
  const q = "receipt" in which ? `receipt=${which.receipt}` : `version=${which.version}`;
  const res = await fetch(`/api/p/${slug}/tx?${q}`);
  if (!res.ok) return null;
  const t = (await res.json()) as { signature: string; signer: string; memos: string[]; failed: boolean };
  return { ...t, via: "circuit" };
}

export type CheckState = "wait" | "run" | "ok" | "fail" | "skip";
export interface Check {
  label: string;
  state: CheckState;
  detail?: string;
}

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const via = (t: ChainTx) => (t.via === "solana" ? "read from Solana's public RPC" : "read through Circuit's server (Solana's public RPC was busy)");

/** The four checks for a receipt. `update` is called as each one finishes. */
export async function verifyReceipt(slug: string, receipt: Receipt, rules: RulesVersion[], update: (checks: Check[]) => void): Promise<boolean> {
  const checks: Check[] = [
    { label: "Work out the receipt's fingerprint", state: "run" },
    { label: "Find its batch on Solana", state: "wait" },
    { label: "Check the fingerprint is in that batch", state: "wait" },
    { label: "Check it ran with published rules", state: "wait" },
  ];
  const set = (i: number, state: CheckState, detail?: string) => {
    checks[i] = { ...checks[i], state, detail };
    if (state === "ok" && i + 1 < checks.length) checks[i + 1] = { ...checks[i + 1], state: "run" };
    update(checks.map((c) => ({ ...c })));
  };
  const stop = (i: number, detail: string) => {
    set(i, "fail", detail);
    for (let j = i + 1; j < checks.length; j++) checks[j] = { ...checks[j], state: "skip" };
    update(checks.map((c) => ({ ...c })));
    return false;
  };
  update(checks.map((c) => ({ ...c })));

  const leaf = await receiptLeaf(receipt);
  set(0, "ok", `SHA-256 ${short(leaf)}, worked out in your browser`);

  const res = await fetch(`/api/p/${slug}/proof?receipt=${receipt.id}`);
  const body = res.ok ? ((await res.json()) as { anchor: { batch: { root: string; signature: string | null; status: string }; proof: ProofStep[] } | null }) : null;
  const anchor = body?.anchor;
  if (!anchor || !anchor.batch.signature) return stop(1, "Not in a batch yet. Receipts are written in batches every few minutes; try again shortly.");
  const tx = await readProofTx(slug, anchor.batch.signature, { receipt: receipt.id });
  if (!tx) return stop(1, "Solana doesn't have the batch transaction yet. Try again in a minute.");
  if (tx.failed) return stop(1, "The batch transaction failed on Solana.");
  const memo = tx.memos.find((m) => m.startsWith(`circuit:batch:v1:${anchor.batch.root}:`));
  if (!memo || memo !== batchMemo(anchor.batch.root, Number(memo.split(":").pop()))) return stop(1, "The transaction doesn't carry this batch's root.");
  set(1, "ok", `Batch root ${short(anchor.batch.root)} in tx ${short(tx.signature)}, ${via(tx)}`);

  if (!(await verifyProof(leaf, anchor.proof, anchor.batch.root))) return stop(2, "The receipt's fingerprint doesn't lead to the batch root: this receipt isn't the one that was written.");
  set(2, "ok", `${anchor.proof.length} steps from the receipt to the root, all checked`);

  const version = rules.find((v) => v.fingerprint === receipt.rules);
  if (!receipt.rules) return stop(3, "This receipt doesn't say which rules it ran with.");
  if (!version) return stop(3, `It ran with rules ${receipt.rules.slice(0, 8)}, which aren't among the versions written to Solana.`);
  set(3, "ok", `Rules v${version.version} (${version.fingerprint.slice(0, 8)}), written to Solana by the creator`);
  return true;
}

/** The checks for the rules shown on a page. */
export async function verifyRules(slug: string, program: unknown, owner: string, rules: RulesVersion[], update: (checks: Check[]) => void): Promise<boolean> {
  const checks: Check[] = [
    { label: "Work out the rules' fingerprint", state: "run" },
    { label: "Find the version written to Solana", state: "wait" },
    { label: "Check the creator's wallet wrote it", state: "wait" },
  ];
  const set = (i: number, state: CheckState, detail?: string) => {
    checks[i] = { ...checks[i], state, detail };
    if (state === "ok" && i + 1 < checks.length) checks[i + 1] = { ...checks[i + 1], state: "run" };
    if (state === "fail") for (let j = i + 1; j < checks.length; j++) checks[j] = { ...checks[j], state: "skip" };
    update(checks.map((c) => ({ ...c })));
  };
  update(checks.map((c) => ({ ...c })));

  const fp = await rulesFingerprint(program);
  set(0, "ok", `SHA-256 ${fp.slice(0, 8)}…, worked out in your browser from the rules on this page`);
  const version = [...rules].reverse().find((v) => v.fingerprint === fp);
  if (!version) {
    set(1, "fail", rules.length ? "These rules aren't the ones written to Solana: the creator changed them and hasn't written the new version yet." : "The creator hasn't written these rules to Solana yet.");
    return false;
  }
  const tx = await readProofTx(slug, version.signature, { version: version.version });
  if (!tx || tx.failed || !tx.memos.includes(rulesMemo(slug, fp))) {
    set(1, "fail", "Solana's copy doesn't match these rules.");
    return false;
  }
  set(1, "ok", `Version ${version.version} in tx ${short(tx.signature)}, ${via(tx)}`);
  if (tx.signer !== owner) {
    set(2, "fail", `It was signed by ${short(tx.signer)}, not the page's creator.`);
    return false;
  }
  set(2, "ok", `Signed by ${short(owner)}, the wallet that published this page`);
  return true;
}
