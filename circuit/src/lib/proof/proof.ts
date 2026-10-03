/**
 * Proof on Solana: the same code runs in the browser and on the server, so
 * anyone can recompute every fingerprint here themselves.
 *
 * - Rules: the SHA-256 of a program's canonical rules. The creator's wallet
 *   writes it to Solana in a memo when publishing.
 * - Receipts: each finished receipt's SHA-256 is a leaf; every few minutes
 *   Circuit puts the new leaves in a Merkle tree and writes the root to Solana
 *   in one memo. A receipt's proof is the path from its leaf to that root.
 */
import { canonicalRules } from "@/lib/ir/fingerprint";

/** The Solana Memo program (v2). */
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (b) => parseInt(b, 16));
export const isHex64 = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);

async function sha256(bytes: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)));
}
export const sha256Text = (text: string) => sha256(new TextEncoder().encode(text));

/** JSON with object keys sorted, so the same data always gives the same text. */
export function canonicalJson(v: unknown): string {
  const sort = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(sort) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sort((x as Record<string, unknown>)[k])])) : x;
  return JSON.stringify(sort(v));
}

/** Full SHA-256 (64 hex) of a program's rules. Pages show the first 8 characters. */
export const rulesFingerprint = (program: unknown) => sha256Text(canonicalRules(program));
export const shortFp = (fp: string) => fp.slice(0, 8);

/** A finished receipt's leaf: SHA-256 of its canonical JSON. */
export const receiptLeaf = (receipt: unknown) => sha256Text(canonicalJson(receipt));

// --- Merkle tree ---------------------------------------------------------------

/** Parent of two nodes: SHA-256 of their bytes, left then right. */
const parent = (left: string, right: string) => sha256(new Uint8Array([...unhex(left), ...unhex(right)]));

export interface ProofStep {
  hash: string;
  /** Which side the sibling is on. */
  side: "left" | "right";
}

/** Every level of the tree, leaves first. An odd node out moves up unchanged. */
async function levels(leaves: string[]): Promise<string[][]> {
  const out = [leaves];
  while (out[out.length - 1].length > 1) {
    const level = out[out.length - 1];
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? await parent(level[i], level[i + 1]) : level[i]);
    out.push(next);
  }
  return out;
}

export async function merkleRoot(leaves: string[]): Promise<string> {
  if (!leaves.length) throw new Error("No leaves.");
  const all = await levels(leaves);
  return all[all.length - 1][0];
}

/** The path from leaf `index` up to the root. */
export async function merkleProof(leaves: string[], index: number): Promise<ProofStep[]> {
  const all = await levels(leaves);
  const steps: ProofStep[] = [];
  let i = index;
  for (const level of all.slice(0, -1)) {
    const sibling = i % 2 === 0 ? i + 1 : i - 1;
    if (sibling < level.length) steps.push({ hash: level[sibling], side: i % 2 === 0 ? "right" : "left" });
    i = Math.floor(i / 2);
  }
  return steps;
}

/** Walks a proof from a leaf; true if it arrives at `root`. */
export async function verifyProof(leaf: string, proof: ProofStep[], root: string): Promise<boolean> {
  let h = leaf;
  for (const s of proof) h = s.side === "right" ? await parent(h, s.hash) : await parent(s.hash, h);
  return h === root;
}

// --- memos -------------------------------------------------------------------

/** "circuit:rules:v1:<page>:<fingerprint>", written by the creator's wallet. */
export const rulesMemo = (slug: string, fingerprint: string) => `circuit:rules:v1:${slug}:${fingerprint}`;
/** "circuit:batch:v1:<root>:<count>", written by Circuit. */
export const batchMemo = (root: string, count: number) => `circuit:batch:v1:${root}:${count}`;

export function parseMemo(text: string): { kind: "rules"; slug: string; fingerprint: string } | { kind: "batch"; root: string; count: number } | null {
  let m = /^circuit:rules:v1:([a-z0-9-]{3,40}):([0-9a-f]{64})$/.exec(text.trim());
  if (m) return { kind: "rules", slug: m[1], fingerprint: m[2] };
  m = /^circuit:batch:v1:([0-9a-f]{64}):(\d{1,6})$/.exec(text.trim());
  if (m) return { kind: "batch", root: m[1], count: Number(m[2]) };
  return null;
}
