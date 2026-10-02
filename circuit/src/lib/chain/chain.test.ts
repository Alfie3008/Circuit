import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatIssues, parseProgram } from "@/lib/ir";
import { mockAdapters } from "@/lib/runtime/adapters";
import { begin, finish, trigger } from "@/lib/runtime/engine";
import { Rng } from "@/lib/runtime/rng";
import { initialState } from "@/lib/runtime/state";
import { parseTransaction, PUMP_PROGRAM, solscanTx, WSOL_MINT, type RpcTransaction, type TokenBalance } from "./parse";
import { history, holderCount, pollEvents, type Fetcher } from "./rpc";

// Realistic base58 addresses (shape only).
const MINT = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
const TRADER = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const CURVE = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf";
const CREATOR = "Fh4mBxwQyaD1zM5o2TkzjDqrXyvDWv3pP5wqGxSmW5yB";
const OTHER = "3Kz9w1oJYxRk4D6fHq8EoN2WbDtHxM1CbVwq9JmGq2Lr";

const bal = (accountIndex: number, mint: string, owner: string, amount: number, decimals = 6): TokenBalance => ({
  accountIndex,
  mint,
  owner,
  uiTokenAmount: { amount: String(Math.round(amount * 10 ** decimals)), decimals },
});

function tx(opts: {
  sig: string;
  keys?: string[];
  pre?: number[];
  post?: number[];
  preTok?: TokenBalance[];
  postTok?: TokenBalance[];
  logs?: string[];
  err?: unknown;
  blockTime?: number;
}): RpcTransaction {
  const keys = opts.keys ?? [TRADER, CURVE, MINT];
  return {
    slot: 312_884_019,
    blockTime: opts.blockTime ?? 1_790_000_000,
    meta: {
      err: opts.err ?? null,
      fee: 5000,
      preBalances: opts.pre ?? keys.map(() => 0),
      postBalances: opts.post ?? keys.map(() => 0),
      preTokenBalances: opts.preTok ?? [],
      postTokenBalances: opts.postTok ?? [],
      logMessages: opts.logs ?? [],
    },
    transaction: { signatures: [opts.sig], message: { accountKeys: keys.map((pubkey, i) => ({ pubkey, signer: i === 0, writable: true })) } },
  };
}

// A 1.25 SOL buy of 3,000,000 tokens on the bonding curve.
const BUY = tx({
  sig: "5Kd9buy1111111111111111111111111111111111111111111111111111111111111111111111111wQ2r",
  pre: [10_000_000_000, 50_000_000_000, 1_000_000],
  post: [10_000_000_000 - 1_250_000_000 - 5000, 51_250_000_000, 1_000_000],
  preTok: [bal(1, MINT, CURVE, 800_000_000)],
  postTok: [bal(1, MINT, CURVE, 797_000_000), bal(3, MINT, TRADER, 3_000_000)],
});

describe("parseTransaction", () => {
  it("reads a bonding-curve buy from balance changes, with Solscan proof", () => {
    const [e] = parseTransaction(BUY, { mint: MINT, supply: 1_000_000_000, solUsd: 170 });
    expect(e.type).toBe("trade");
    expect(e.source).toBe("live");
    expect(e.data).toMatchObject({ side: "buy", amount: 1.25, tokenAmount: 3_000_000, walletAddress: TRADER, wallet: "7xKX…gAsU" });
    // price 1.25/3e6 SOL × 1e9 supply × $170
    expect(e.data.marketCap).toBe(70833);
    expect(e.proof).toEqual({ signature: BUY.transaction.signatures[0], slot: 312_884_019, explorer: solscanTx(BUY.transaction.signatures[0]) });
    expect(e.timestamp).toBe(1_790_000_000_000);
  });

  it("reads a sell", () => {
    const sell = tx({
      sig: "sell",
      pre: [1_000_000_000, 0, 0],
      post: [1_000_000_000 + 400_000_000 - 5000, 0, 0],
      preTok: [bal(3, MINT, TRADER, 500_000)],
      postTok: [bal(3, MINT, TRADER, 0)],
    });
    expect(parseTransaction(sell, { mint: MINT })[0].data).toMatchObject({ side: "sell", amount: 0.4, tokenAmount: 500_000 });
  });

  it("counts wrapped SOL (post-graduation swaps)", () => {
    const swap = tx({
      sig: "swap",
      pre: [2_000_000_000, 0, 0],
      post: [2_000_000_000 - 5000, 0, 0],
      preTok: [bal(4, WSOL_MINT, TRADER, 0.7, 9)],
      postTok: [bal(4, WSOL_MINT, TRADER, 0, 9), bal(3, MINT, TRADER, 1_000)],
    });
    expect(parseTransaction(swap, { mint: MINT })[0].data).toMatchObject({ side: "buy", amount: 0.7 });
  });

  it("ignores failed transactions and transactions that don't trade the mint", () => {
    expect(parseTransaction({ ...BUY, meta: { ...BUY.meta!, err: { InstructionError: [0, "Custom"] } } }, { mint: MINT })).toEqual([]);
    expect(parseTransaction(tx({ sig: "noop" }), { mint: MINT })).toEqual([]);
  });

  it("reports SOL arriving at a watched wallet, and pump.fun graduation", () => {
    const pay = tx({ sig: "pay", keys: [OTHER, CREATOR], pre: [5e9, 1e9], post: [5e9 - 2e8 - 5000, 1.2e9] });
    expect(parseTransaction(pay, { mint: MINT, wallet: CREATOR })).toMatchObject([{ type: "wallet_receives", data: { wallet: CREATOR, amount: 0.2 } }]);
    const migrate = tx({ sig: "mig", logs: [`Program ${PUMP_PROGRAM} invoke [1]`, "Program log: Instruction: Migrate"] });
    expect(parseTransaction(migrate, { mint: MINT }).map((e) => e.type)).toEqual(["token_graduates"]);
  });
});

/** A fake JSON-RPC endpoint answering by method. */
function fakeRpc(handlers: Record<string, (params: unknown) => unknown>) {
  const calls: { method: string; params: unknown }[] = [];
  const f: Fetcher = async (input, init) => {
    if (String(input).includes("jup.ag")) return Response.json({ [WSOL_MINT]: { usdPrice: 170 } });
    const { method, params } = JSON.parse(String(init?.body));
    calls.push({ method, params });
    const h = handlers[method];
    if (!h) return Response.json({ jsonrpc: "2.0", id: 1, error: { message: `no ${method}` } });
    return Response.json({ jsonrpc: "2.0", id: 1, result: h(params) });
  };
  return { f, calls };
}

describe("polling and history", () => {
  beforeEach(() => vi.stubEnv("CIRCUIT_SOLANA_RPC_URL", "https://rpc.example"));
  afterEach(() => vi.unstubAllEnvs());

  const supply = () => ({ value: { amount: "1000000000000000", decimals: 6 } });

  it("first poll returns only a cursor; the next returns new trades oldest first", async () => {
    const older = { ...BUY, blockTime: 1_790_000_000, transaction: { ...BUY.transaction, signatures: ["sigA"] } };
    const newer = { ...BUY, blockTime: 1_790_000_060, transaction: { ...BUY.transaction, signatures: ["sigB"] } };
    const { f, calls } = fakeRpc({
      getSignaturesForAddress: (p) => {
        const until = (p as [string, { until?: string }])[1].until;
        return until ? [{ signature: "sigB", slot: 2, err: null }, { signature: "sigA", slot: 1, err: null }] : [{ signature: "sig0", slot: 0, err: null }];
      },
      getTransaction: (p) => ((p as [string])[0] === "sigA" ? older : newer),
      getTokenSupply: supply,
    });
    const first = await pollEvents({ mint: MINT }, f);
    expect(first).toMatchObject({ events: [], cursor: "sig0" });
    expect(calls.some((c) => c.method === "getTransaction")).toBe(false); // nothing replayed
    const next = await pollEvents({ mint: MINT, until: "sig0" }, f);
    expect(next.cursor).toBe("sigB");
    expect(next.events.map((e) => e.proof?.signature)).toEqual(["sigA", "sigB"]);
  });

  it("rejects malformed addresses before calling the RPC", async () => {
    const { f, calls } = fakeRpc({});
    await expect(pollEvents({ mint: "not-a-mint" }, f)).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(0);
  });

  it("history pages back until the time window ends", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sigs = [
      { signature: "s3", slot: 3, err: null, blockTime: now - 60 },
      { signature: "s2", slot: 2, err: { failed: true }, blockTime: now - 120 },
      { signature: "s1", slot: 1, err: null, blockTime: now - 3 * 3600 },
    ];
    const { f } = fakeRpc({
      getSignaturesForAddress: () => sigs,
      getTransaction: (p) => ({ ...BUY, blockTime: now - 60, transaction: { ...BUY.transaction, signatures: [(p as [string])[0]] } }),
      getTokenSupply: supply,
    });
    const out = await history({ mint: MINT, hours: 1, max: 100 }, f);
    expect(out.scanned).toBe(2); // s1 is outside the hour
    expect(out.events.map((e) => e.proof?.signature)).toEqual(["s3"]); // s2 failed
  });

  it("counts distinct holders with DAS paging (Helius only)", async () => {
    vi.stubEnv("HELIUS_API_KEY", "test");
    const page = (n: number, from: number) => ({ token_accounts: Array.from({ length: n }, (_, i) => ({ owner: `owner${from + i}`, amount: i % 10 === 0 ? 0 : 5 })) });
    const { f, calls } = fakeRpc({ getTokenAccounts: (p) => ((p as { page: number }).page === 1 ? page(1000, 0) : page(10, 1000)) });
    expect(await holderCount(MINT, f)).toEqual({ holders: 909, capped: false });
    expect(calls[0].params).toEqual({ mint: MINT, page: 1, limit: 1000 });
  });
});

describe("live events through the interpreter", () => {
  it("a real trade crosses a milestone, and the receipt carries the Solscan proof", async () => {
    const parsed = parseProgram({ version: 1, scripts: [{ event: { type: "volume_milestone", amount: 1 }, body: [{ type: "update_feed", message: "Milestone {event.milestone}" }] }] });
    if (!parsed.ok) throw new Error(formatIssues(parsed.issues));
    const state = initialState(1);
    const rng = new Rng(1);
    const [event] = parseTransaction(BUY, { mint: MINT, supply: 1e9, solUsd: 170 });
    const [match] = trigger(state, parsed.program, event, rng);
    const { receipt, run } = begin(state, match, { rng, adapters: mockAdapters(rng) });
    let r = await run.next();
    while (!r.done) r = await run.next();
    finish(state, receipt, r.value);
    expect(receipt.event.source).toBe("live");
    expect(receipt.event.proof?.explorer).toBe(solscanTx(BUY.transaction.signatures[0]));
    expect(state.market.marketCap).toBe(70833);
    expect(state.feed[0].text).toBe("Milestone 1");
  });
});
