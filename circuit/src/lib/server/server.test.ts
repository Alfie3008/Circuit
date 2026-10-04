import { afterEach, describe, expect, it, vi } from "vitest";
import { fuelOf } from "@/lib/fuel";
import { parseProgram, formatIssues, type Program } from "@/lib/ir";
import { DEFAULT_SETUP } from "@/lib/project/storage";
import type { CircuitEvent } from "@/lib/runtime/events";
import { getTemplate } from "@/lib/templates";
import { claimNew, intake } from "./chainFeed";
import { memoryDb } from "./memoryDb";
import { runProject } from "./runner";
import { localClock, timerEvents } from "./schedule";
import { tick } from "./tick";
import { emptyMeta, type Db, type ServerProject } from "./types";

const T0 = Date.UTC(2026, 9, 2, 8, 0); // 2 Oct 2026 08:00 UTC = 09:00 in London (BST)

function program(raw: unknown): Program {
  const r = parseProgram(raw);
  if (!r.ok) throw new Error(formatIssues(r.issues));
  return r.program;
}

async function publish(db: Db, id: string, prog: Program, over: Partial<ServerProject> = {}) {
  await db.saveProject({
    id,
    slug: id,
    owner: "Owner",
    name: id,
    program: prog,
    setup: { ...DEFAULT_SETUP },
    live: true,
    timezone: "Europe/London",
    createdAt: T0,
    updatedAt: T0,
    ...over,
  });
  await db.putState(id, (await import("@/lib/runtime/state")).initialState(1), { ...emptyMeta(), liveSince: T0 }, 0);
}

const trade = (amount: number, t = T0, sig?: string): CircuitEvent => ({
  type: "trade",
  source: "live",
  timestamp: t,
  data: { amount, side: "buy", wallet: "w" },
  ...(sig ? { proof: { signature: sig, slot: 1, explorer: `https://solscan.io/tx/${sig}` } } : {}),
});

const crew = () => getTemplate("living-crew")!.program;
const every = (minutes: number) => program({ version: 1, scripts: [{ event: { type: "every_minutes", minutes }, body: [{ type: "update_feed", message: "tick" }] }] });

afterEach(() => {
  delete process.env.CIRCUIT_RUNS_PER_MINUTE;
});

describe("server runner", () => {
  it("runs events on the stored world and saves state and receipts", async () => {
    const db = memoryDb();
    await publish(db, "crew", crew());
    const r = await runProject(db, "crew", [trade(6), trade(6, T0 + 1)], { now: () => T0 });
    expect(r.executions).toBe(1); // 12 SOL crosses the 10 SOL milestone once
    const row = await db.getState("crew");
    expect(row?.state.agents).toHaveLength(1);
    expect(row?.version).toBe(2);
    const receipts = await db.listReceipts("crew", 10);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe("complete");
    expect(receipts[0].event.source).toBe("live");
  });

  it("does nothing for projects that aren't live", async () => {
    const db = memoryDb();
    await publish(db, "off", crew(), { live: false });
    expect((await runProject(db, "off", [trade(20)])).skipped).toBe("not live");
  });

  it("caps executions per project per minute and counts what it dropped", async () => {
    process.env.CIRCUIT_RUNS_PER_MINUTE = "3";
    const db = memoryDb();
    await publish(db, "busy", crew());
    const events = Array.from({ length: 10 }, (_, i) => trade(10, T0 + i));
    const r = await runProject(db, "busy", events, { now: () => T0 });
    expect(r.executions).toBe(3);
    expect(r.dropped).toBe(7);
    expect((await db.getState("busy"))?.meta.dropped).toBe(7);
    // Same minute: still capped. Next minute: runs again.
    expect((await runProject(db, "busy", [trade(10, T0 + 20)], { now: () => T0 + 1000 })).executions).toBe(0);
    expect((await runProject(db, "busy", [trade(10, T0 + 61_000)], { now: () => T0 + 61_000 })).executions).toBe(1);
  });

  it("serializes concurrent runs of one project (nothing is lost)", async () => {
    const db = memoryDb();
    await publish(db, "par", crew());
    await Promise.all(Array.from({ length: 5 }, (_, i) => runProject(db, "par", [trade(10, T0 + i)], { now: () => T0 })));
    expect((await db.getState("par"))?.state.agents).toHaveLength(5);
  });

  it("redoes a run on fresh state when another server wrote first", async () => {
    const db = memoryDb();
    await publish(db, "race", crew());
    let raced = false;
    const racing: Db = {
      ...db,
      async putState(id, state, meta, expected) {
        if (!raced) {
          raced = true;
          const other = (await db.getState(id))!;
          other.state.variables.other = "wrote";
          await db.putState(id, other.state, other.meta, other.version);
        }
        return db.putState(id, state, meta, expected);
      },
    };
    expect((await runProject(racing, "race", [trade(10)], { now: () => T0 })).executions).toBe(1);
    const row = await db.getState("race");
    expect(row?.state.variables.other).toBe("wrote"); // the other write survived
    expect(row?.state.agents).toHaveLength(1); // and so did ours
  });

  it("really waits on WAIT blocks, up to 10 s, and says when it shortened one", async () => {
    const db = memoryDb();
    const prog = program({
      version: 1,
      scripts: [{ event: { type: "every_minutes", minutes: 1 }, body: [{ type: "wait", seconds: 3 }, { type: "wait", seconds: 600 }, { type: "update_feed", message: "done" }] }],
    });
    await publish(db, "w", prog);
    const slept: number[] = [];
    const r = await runProject(db, "w", [{ type: "tick", source: "schedule", timestamp: T0, data: { minutes: 1 } }], { now: () => T0, sleep: async (ms) => void slept.push(ms) });
    expect(r.executions).toBe(1);
    expect(slept).toEqual([3000, 10000]);
    const [receipt] = await db.listReceipts("w", 1);
    expect(receipt.entries.some((e) => /shortened a 600s wait/.test(e.text))).toBe(true);
    expect(receipt.status).toBe("complete");
  });

  it("without creator fees, AI blocks use fallbacks and spend nothing", async () => {
    const db = memoryDb();
    await publish(db, "dry", crew());
    let calls = 0;
    const caller = async () => {
      calls++;
      return "{}";
    };
    const r = await runProject(db, "dry", [trade(10)], { now: () => T0, caller });
    expect(r.executions).toBe(1);
    expect(calls).toBe(0);
    const [receipt] = await db.listReceipts("dry", 1);
    expect(receipt.entries.some((e) => /no creator fees|fuel is empty/i.test(`${e.text} ${(e.details ?? []).join(" ")}`))).toBe(true);
  });

  it("spends at most 90% of the creator fees earned on AI", async () => {
    const db = memoryDb();
    await publish(db, "ai", crew());
    await db.addFees("ai", "2026-10-02", 0.0025 / 0.9); // fuel for 2 calls at $0.001
    let calls = 0;
    const caller = async () => {
      calls++;
      return JSON.stringify({ name: `Real${calls}`, personality: "calm", bio: "real" });
    };
    const r = await runProject(db, "ai", Array.from({ length: 4 }, (_, i) => trade(10, T0 + i)), { now: () => T0, caller });
    expect(r.executions).toBe(4);
    expect(calls).toBe(2);
    expect(r.aiCalls).toBe(2);
    expect((await db.aiUsage("ai", "2026-10-02")).calls).toBe(2);
    const names = (await db.getState("ai"))!.state.agents.map((a) => a.name);
    expect(names.filter((n) => n.startsWith("Real"))).toHaveLength(2);
    expect(fuelOf(await db.fuelTotals("ai")).callsLeft).toBe(0);
  });
});

describe("server failsafes", () => {
  it("a broken stored program records the problem and keeps going instead of throwing", async () => {
    const db = memoryDb();
    await publish(db, "broken", { version: 1, variables: [], scripts: [{ event: null, body: [] }], loose: [] } as unknown as Program);
    const r = await runProject(db, "broken", [trade(1)], { now: () => T0 });
    expect(r.errors).toBe(1);
    expect((await db.getState("broken"))!.meta.lastError).toMatch(/couldn't be handled/);
  });

  it("never saves a world too big to load again: the run's changes are undone and the receipt says why", async () => {
    const db = memoryDb();
    const big = "x".repeat(99_000);
    await publish(db, "huge", program({ version: 1, scripts: [{ event: { type: "every_minutes", minutes: 1 }, body: [{ type: "repeat", times: 50, do: [{ type: "create_entity", entityType: "item", name: big }] }] }] }));
    const r = await runProject(db, "huge", [{ type: "tick", source: "schedule", timestamp: T0, data: { minutes: 1 } }], { now: () => T0 });
    expect(r.executions).toBe(1);
    const row = (await db.getState("huge"))!;
    expect(row.state.entities).toHaveLength(0);
    expect(row.meta.lastError).toMatch(/too big to save/);
    const [receipt] = await db.listReceipts("huge", 1);
    expect(receipt.entries.at(-1)!.text).toMatch(/too big to save/);
  });
});

describe("live coin stats", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("reads the holder count every 10 minutes: the first reading sets it, later changes fire crossings", async () => {
    vi.stubEnv("HELIUS_API_KEY", "test");
    const mint = "MintAddress1111111111111111111111111111111";
    let owners = 40;
    let holderReads = 0;
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      const { method } = JSON.parse(String(init?.body ?? "{}"));
      const result =
        method === "getTokenAccounts"
          ? (holderReads++, { token_accounts: Array.from({ length: owners }, (_, i) => ({ owner: `o${i}`, amount: 1 })) })
          : method === "getSignaturesForAddress"
            ? []
            : null;
      return Response.json({ jsonrpc: "2.0", id: 1, result });
    });
    const db = memoryDb();
    const prog = program({
      version: 1,
      scripts: [
        { event: { type: "holder_count_crosses", direction: "above", threshold: 50 }, body: [{ type: "update_feed", message: "50 holders!" }] },
        { event: { type: "every_minutes", minutes: 10 }, body: [{ type: "set_var", var: "h", value: { type: "coin_stat", stat: "holders" } }] },
      ],
    });
    await publish(db, "coin", prog, { setup: { ...DEFAULT_SETUP, launchMode: "existing", tokenAddress: mint } });

    await tick(db, { now: () => T0, poll: true });
    expect((await db.getState("coin"))!.state.market.holders).toBe(40); // set, no crossing from zero
    owners = 55;
    await tick(db, { now: () => T0 + 60_000, poll: true }); // too soon to read again
    expect(holderReads).toBe(1);
    await tick(db, { now: () => T0 + 10 * 60_000, poll: true });
    const { state } = (await db.getState("coin"))!;
    expect(state.market.holders).toBe(55);
    expect(state.feed.map((f) => f.text)).toContain("50 holders!");
    expect(state.variables.h).toBe(55); // the coin stat block reads the live number
  });
});

describe("AI fuel intake", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("counts creator fees from every claimed trade once, then keeps only watched events", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ So11111111111111111111111111111111111111112: { usdPrice: 200 } }));
    const db = memoryDb();
    const mint = "MintAddress1111111111111111111111111111111";
    await publish(db, "coin", crew(), { setup: { ...DEFAULT_SETUP, launchMode: "existing", tokenAddress: mint, monitor: { ...DEFAULT_SETUP.monitor, trades: false, volume: false } } });
    const p = (await db.getProject("coin"))!;
    const t = (amount: number, sig: string): CircuitEvent => ({ ...trade(amount, T0, sig), data: { amount, side: "buy", wallet: "w", token: mint } });

    const kept = await intake(db, p, [t(10, "s1"), t(5, "s2")], T0);
    expect(kept).toEqual([]); // the program doesn't watch trades…
    expect((await db.fuelTotals("coin")).feesUsd).toBeCloseTo(15 * 0.003 * 200); // …but their fees still count
    await intake(db, p, [t(10, "s1")], T0); // a redelivery counts nothing
    expect((await db.fuelTotals("coin")).feesUsd).toBeCloseTo(9);
  });
});

describe("schedule", () => {
  it("reads local time in the project's time zone", () => {
    expect(localClock(T0, "Europe/London")).toMatchObject({ day: "2026-10-02", hhmm: "09:00" });
    expect(localClock(T0, "Not/AZone").hhmm).toBe("08:00"); // falls back to UTC
  });

  it("fires interval timers when due, tolerating a late cron", () => {
    const meta = { ...emptyMeta(), liveSince: T0 };
    const p = every(60);
    expect(timerEvents(p, meta, T0 + 59 * 60_000, "UTC")).toHaveLength(0);
    expect(timerEvents(p, meta, T0 + 60 * 60_000 + 20_000, "UTC")).toHaveLength(1);
    expect(timerEvents(p, meta, T0 + 61 * 60_000, "UTC")).toHaveLength(0);
  });

  it("fires 'at time' once a day, in local time, a few minutes late at most", () => {
    const at = program({ version: 1, scripts: [{ event: { type: "at_time", time: "09:00" }, body: [] }] });
    const meta = { ...emptyMeta(), liveSince: T0 - 3600_000 };
    expect(timerEvents(at, meta, T0 - 60_000, "Europe/London")).toHaveLength(0); // 08:59
    expect(timerEvents(at, meta, T0 + 2 * 60_000, "Europe/London")).toHaveLength(1); // 09:02
    expect(timerEvents(at, meta, T0 + 3 * 60_000, "Europe/London")).toHaveLength(0); // already today
    const late = { ...emptyMeta(), liveSince: T0 - 3600_000 };
    expect(timerEvents(at, late, T0 + 30 * 60_000, "Europe/London")).toHaveLength(0); // 09:30: missed
  });
});

describe("cron tick", () => {
  it("runs due timers for every live project, with schedule receipts", async () => {
    const db = memoryDb();
    await publish(db, "t1", every(1));
    await publish(db, "t2", every(5));
    await publish(db, "t3", every(1), { live: false });
    const r = await tick(db, { now: () => T0 + 61_000, poll: false });
    expect(r.projects).toBe(2);
    expect(r.ran.find((x) => x.projectId === "t1")?.executions).toBe(1);
    expect(r.ran.find((x) => x.projectId === "t2")?.executions).toBe(0);
    const [receipt] = await db.listReceipts("t1", 1);
    expect(receipt.event.source).toBe("schedule");
    expect((await db.getState("t1"))?.state.feed.at(-1)?.text).toBe("tick");
  });
});

describe("chain events", () => {
  it("runs each transaction once, however it arrives", async () => {
    const db = memoryDb();
    const fresh = await claimNew(db, "p", [trade(1, T0, "sigA"), trade(1, T0, "sigB")]);
    expect(fresh).toHaveLength(2);
    expect(await claimNew(db, "p", [trade(1, T0, "sigA"), trade(1, T0, "sigC")])).toHaveLength(1);
  });
});
