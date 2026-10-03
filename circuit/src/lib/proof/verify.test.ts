/** The browser's Verify, end to end: real proofs from the server code, Solana answers faked. */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Receipt } from "@/lib/runtime/state";
import { batchMemo, merkleProof, merkleRoot, receiptLeaf, rulesFingerprint, rulesMemo } from "./proof";
import { verifyReceipt, verifyRules, type Check } from "./verify";

const OWNER = "OwnerWa11et111111111111111111111111111111111";
const receipt = (id: number, rules: string): Receipt => ({
  id,
  startedAt: id,
  finishedAt: id + 1,
  event: { type: "trade", label: "Trade", source: "live", data: { amount: id } },
  status: "complete",
  error: null,
  steps: 1,
  entries: [],
  rules,
});
const program = { version: 1, scripts: [{ event: { type: "button" }, body: [] }] };

/** Fakes the page's proof API and Solana's public RPC. */
function fakeNet(routes: { proof?: unknown; tx?: { signer: string; memos: string[]; failed?: boolean } | null; rpcDown?: boolean; serverTx?: unknown }) {
  const seen: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    seen.push(url);
    if (url.includes("/proof?")) return Response.json(routes.proof ?? { anchor: null });
    if (url.includes("/tx?")) return routes.serverTx ? Response.json(routes.serverTx) : new Response("{}", { status: 404 });
    if (routes.rpcDown) return new Response("busy", { status: 429 });
    const t = routes.tx;
    return Response.json({
      result: t
        ? { slot: 1, meta: { err: t.failed ? { x: 1 } : null, fee: 0, preBalances: [], postBalances: [] }, transaction: { signatures: ["sig"], message: { accountKeys: [t.signer], instructions: t.memos.map((m) => ({ program: "spl-memo", parsed: m })) } } }
        : null,
    });
  });
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

describe("Verify in the browser", () => {
  it("a real receipt passes all four checks; a changed one fails at the batch", async () => {
    const fp = await rulesFingerprint(program);
    const receipts = [1, 2, 3].map((i) => receipt(i, fp));
    const leaves = await Promise.all(receipts.map(receiptLeaf));
    const root = await merkleRoot(leaves);
    const anchor = { batch: { root, signature: "batchsig", status: "confirmed" }, proof: await merkleProof(leaves, 1) };
    const rules = [{ version: 1, fingerprint: fp, signature: "rulessig", slot: 1, at: 0 }];
    fakeNet({ proof: { anchor }, tx: { signer: "CircuitKey", memos: [batchMemo(root, 3)] } });

    let last: Check[] = [];
    expect(await verifyReceipt("coin", receipts[1], rules, (c) => (last = c))).toBe(true);
    expect(last.map((c) => c.state)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(last[1].detail).toMatch(/public RPC/);

    expect(await verifyReceipt("coin", { ...receipts[1], steps: 9 }, rules, (c) => (last = c))).toBe(false);
    expect(last.map((c) => c.state)).toEqual(["ok", "ok", "fail", "skip"]);

    // Ran with rules that were never written to Solana.
    expect(await verifyReceipt("coin", receipts[1], [], (c) => (last = c))).toBe(false);
    expect(last[3].state).toBe("fail");
  });

  it("says plainly when a receipt isn't in a batch yet, and falls back to the server when Solana's RPC is busy", async () => {
    let last: Check[] = [];
    fakeNet({ proof: { anchor: null } });
    expect(await verifyReceipt("coin", receipt(1, "x"), [], (c) => (last = c))).toBe(false);
    expect(last[1].detail).toMatch(/Not in a batch yet/);

    const fp = await rulesFingerprint(program);
    const seen = fakeNet({ rpcDown: true, serverTx: { signature: "rulessig", signer: OWNER, memos: [rulesMemo("coin", fp)], failed: false } });
    expect(await verifyRules("coin", program, OWNER, [{ version: 1, fingerprint: fp, signature: "rulessig", slot: 1, at: 0 }], (c) => (last = c))).toBe(true);
    expect(seen.some((u) => u.includes("/api/p/coin/tx?version=1"))).toBe(true);
    expect(last[1].detail).toMatch(/Circuit's server/);
  });

  it("rules fail if they changed since the version on Solana, or someone else signed it", async () => {
    const fp = await rulesFingerprint(program);
    let last: Check[] = [];
    fakeNet({ tx: { signer: OWNER, memos: [rulesMemo("coin", fp)] } });
    expect(await verifyRules("coin", { ...program, scripts: [] }, OWNER, [{ version: 1, fingerprint: fp, signature: "s", slot: 1, at: 0 }], (c) => (last = c))).toBe(false);
    expect(last[1].detail).toMatch(/changed them/);
    fakeNet({ tx: { signer: "SomeoneElse", memos: [rulesMemo("coin", fp)] } });
    expect(await verifyRules("coin", program, OWNER, [{ version: 1, fingerprint: fp, signature: "s", slot: 1, at: 0 }], (c) => (last = c))).toBe(false);
    expect(last[2].state).toBe("fail");
  });
});
