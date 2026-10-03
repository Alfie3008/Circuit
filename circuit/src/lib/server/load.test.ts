/**
 * Load test (not part of the normal run):
 *   CIRCUIT_LOAD_TEST=1 CIRCUIT_TEST_DATABASE_URL=postgres://… npx vitest run src/lib/server/load
 * Hundreds of live projects on a real Postgres, bursts of trades, a spammer
 * and a runaway program, with a slow fake AI. Checks nothing is lost, the
 * caps hold, and well-behaved projects aren't starved.
 */
import { describe, expect, it } from "vitest";
import { pool } from "@/lib/chain/rpc";
import { formatIssues, parseProgram, type Program } from "@/lib/ir";
import { DEFAULT_SETUP } from "@/lib/project/storage";
import type { CircuitEvent } from "@/lib/runtime/events";
import { initialState } from "@/lib/runtime/state";
import { getTemplate } from "@/lib/templates";
import { memoryDb } from "./memoryDb";
import { pgDb } from "./pgDb";
import { runProject } from "./runner";
import { tick } from "./tick";
import { emptyMeta, type Db } from "./types";

const url = process.env.CIRCUIT_TEST_DATABASE_URL;
const enabled = !!process.env.CIRCUIT_LOAD_TEST;
const T0 = Date.UTC(2026, 9, 2, 12, 0);

const prog = (raw: unknown): Program => {
  const r = parseProgram(raw);
  if (!r.ok) throw new Error(formatIssues(r.issues));
  return r.program;
};
const timer = prog({ version: 1, scripts: [{ event: { type: "every_minutes", minutes: 1 }, body: [{ type: "update_feed", message: "tick" }] }] });
const runaway = prog({
  version: 1,
  scripts: [{ event: { type: "trade" }, body: [{ type: "repeat", times: 1000, do: [{ type: "repeat", times: 1000, do: [{ type: "update_feed", message: "spin" }] }] }] }],
});
const trade = (amount: number, t: number): CircuitEvent => ({ type: "trade", source: "live", timestamp: t, data: { amount, side: "buy", wallet: "w" } });

/** A slow, always-successful model. */
let aiCalls = 0;
const slowAi = async () => {
  aiCalls++;
  await new Promise((r) => setTimeout(r, 150));
  return JSON.stringify({ name: "Loady", personality: "steady", bio: "load test" });
};

(enabled ? describe : describe.skip)("load", () => {
  it("handles hundreds of live projects, bursts, a spammer and a runaway program", async () => {
    const db: Db = url ? pgDb(url) : memoryDb();
    if (url) {
      await db.listProjects({ limit: 1 });
      const postgres = (await import("postgres")).default;
      const sql = postgres(url, { onnotice: () => {} });
      await sql`truncate circuit.projects, circuit.project_state, circuit.receipts, circuit.seen, circuit.ai_usage cascade`;
      await sql.end();
    }

    const kinds: [string, Program, number][] = [
      ["crew", getTemplate("living-crew")!.program, 120],
      ["timer", timer, 150],
      ["engine", getTemplate("creator-engine")!.program, 25],
      ["runaway", runaway, 5],
    ];
    const ids: Record<string, string[]> = {};
    let t = Date.now();
    for (const [kind, program, n] of kinds) {
      ids[kind] = [];
      await pool(Array.from({ length: n }, (_, i) => i), 16, async (i) => {
        const id = `${kind}-${i}`;
        ids[kind].push(id);
        await db.saveProject({ id, slug: id, owner: "Owner", name: id, program, setup: { ...DEFAULT_SETUP }, live: true, timezone: "UTC", createdAt: T0, updatedAt: T0 });
        await db.putState(id, initialState(i + 1), { ...emptyMeta(), liveSince: T0 }, 0);
      });
    }
    const total = kinds.reduce((n, k) => n + k[2], 0);
    console.log(`setup: ${total} live projects in ${Date.now() - t} ms (${db.kind})`);

    // 1. A cron tick across everything.
    t = Date.now();
    const r1 = await tick(db, { now: () => T0 + 61_000, poll: false, caller: slowAi });
    const tickMs = Date.now() - t;
    const timerRuns = r1.ran.filter((r) => r.projectId.startsWith("timer")).reduce((n, r) => n + r.executions, 0);
    console.log(`tick: ${r1.projects} projects, ${timerRuns} timer runs, ${r1.deferred} deferred, ${tickMs} ms`);
    expect(r1.deferred).toBe(0);
    expect(timerRuns).toBe(150);

    // 2. A burst of 2,000 trades over the crew projects, delivered concurrently (like webhooks).
    t = Date.now();
    aiCalls = 0;
    const burst = ids.crew.map((id, i) => ({ id, events: Array.from({ length: 2000 / 120 + (i < 2000 % 120 ? 1 : 0) }, (_, k) => trade(1, T0 + 120_000 + k)) }));
    const deliveries = burst.flatMap(({ id, events }) => events.map((e) => ({ id, e }))); // one delivery per trade
    const results = await pool(deliveries, 32, ({ id, e }) => runProject(db, id, [e], { now: () => T0 + 120_000, caller: slowAi }));
    const burstMs = Date.now() - t;
    const crewRuns = results.reduce((n, r) => n + r.executions, 0);
    const agents = (await Promise.all(ids.crew.map((id) => db.getState(id)))).reduce((n, row) => n + (row?.state.agents.length ?? 0), 0);
    console.log(`burst: ${deliveries.length} deliveries, ${crewRuns} runs, ${agents} agents, ${aiCalls} AI calls, ${burstMs} ms (${Math.round(deliveries.length / (burstMs / 1000))} deliveries/s)`);
    // 1 SOL trades, an agent per 10 SOL: no trade lost, no double count.
    const expected = burst.reduce((n, b) => n + Math.floor(b.events.length / 10), 0);
    expect(agents).toBe(expected);
    expect(results.every((r) => !r.skipped || r.skipped === "no events")).toBe(true);

    // 3. A spammer: 5,000 events at one project in one go.
    t = Date.now();
    const spam = await runProject(db, ids.crew[0], Array.from({ length: 5000 }, (_, k) => trade(10, T0 + 180_000 + k)), { now: () => T0 + 180_000, caller: slowAi });
    console.log(`spam: ${spam.executions} runs, ${spam.dropped} dropped, ${Date.now() - t} ms`);
    expect(spam.executions).toBe(60);
    expect(spam.dropped).toBeGreaterThan(4900);

    // 4. Runaway loops alongside a normal project: the step cap ends them, the neighbour is fine.
    t = Date.now();
    const [bad, good] = await Promise.all([
      Promise.all(ids.runaway.map((id) => runProject(db, id, [trade(1, T0 + 240_000)], { now: () => T0 + 240_000 }))),
      runProject(db, ids.timer[0], [{ type: "tick", source: "schedule", timestamp: T0 + 240_000, data: { minutes: 1 } }], { now: () => T0 + 240_000 }),
    ]);
    const badReceipt = (await db.listReceipts(ids.runaway[0], 1))[0];
    console.log(`runaway: ${bad.map((b) => b.errors).join(",")} errors, ${Date.now() - t} ms; receipt: ${badReceipt.status} (${badReceipt.error})`);
    expect(bad.every((b) => b.errors === 1)).toBe(true);
    expect(badReceipt.status).toBe("step_limit");
    expect(good.executions).toBe(1);

    await db.close?.();
  }, 300_000);
});
