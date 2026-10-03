/**
 * The same contract for every store. The Postgres run needs a database:
 * CIRCUIT_TEST_DATABASE_URL=postgres://… npm test (it is skipped otherwise).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTemplate } from "@/lib/templates";
import { DEFAULT_SETUP } from "@/lib/project/storage";
import { initialState, type Receipt } from "@/lib/runtime/state";
import { memoryDb } from "./memoryDb";
import { pgDb } from "./pgDb";
import { emptyMeta, type Db, type ServerProject } from "./types";

const project = (id: string, over: Partial<ServerProject> = {}): ServerProject => ({
  id,
  slug: `slug-${id}`,
  owner: "OwnerWallet1111111111111111111111111111111",
  name: `Project ${id}`,
  program: getTemplate("living-crew")!.program,
  setup: { ...DEFAULT_SETUP, launchMode: "existing", tokenAddress: "Mint111111111111111111111111111111111111111" },
  live: true,
  timezone: "UTC",
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const receipt = (id: number): Receipt => ({
  id,
  startedAt: 1000 + id,
  finishedAt: 1001 + id,
  event: { type: "tick", label: "Timer", source: "runtime", data: {} },
  status: "complete",
  error: null,
  steps: 1,
  entries: [],
});

function contract(name: string, make: () => Promise<Db>) {
  describe(name, () => {
    let db: Db;
    beforeAll(async () => {
      db = await make();
    });
    afterAll(async () => {
      await db.close?.();
    });

    it("saves, finds and lists projects", async () => {
      await db.saveProject(project("a", { updatedAt: 5 }));
      await db.saveProject(project("b", { live: false, owner: "Other", updatedAt: 6 }));
      expect((await db.getProject("a"))?.program.scripts.length).toBeGreaterThan(0);
      expect((await db.getProjectBySlug("slug-b"))?.id).toBe("b");
      expect(await db.getProject("nope")).toBeNull();
      expect((await db.listProjects({ live: true })).map((p) => p.id)).toEqual(["a"]);
      expect((await db.listProjects({ owner: "Other" })).map((p) => p.id)).toEqual(["b"]);
      expect((await db.listProjects({ address: "Mint111111111111111111111111111111111111111" })).map((p) => p.id)).toEqual(["a"]);
      await db.saveProject(project("a", { name: "Renamed", updatedAt: 9 }));
      expect((await db.getProject("a"))?.name).toBe("Renamed");
      await expect(db.saveProject(project("c", { slug: "slug-a" }))).rejects.toThrow();
    });

    it("writes state only at the expected version", async () => {
      const s = initialState(3);
      expect(await db.getState("a")).toBeNull();
      expect(await db.putState("a", s, emptyMeta(), 0)).toBe(true);
      expect(await db.putState("a", s, emptyMeta(), 0)).toBe(false); // someone else already wrote
      s.executionCount = 7;
      expect(await db.putState("a", s, { ...emptyMeta(), dropped: 2 }, 1)).toBe(true);
      const row = await db.getState("a");
      expect(row?.version).toBe(2);
      expect(row?.state.executionCount).toBe(7);
      expect(row?.meta.dropped).toBe(2);
    });

    it("stores receipts newest first, with paging", async () => {
      await db.addReceipts("a", [receipt(1), receipt(2), receipt(3)]);
      await db.addReceipts("a", [{ ...receipt(3), status: "error" }]);
      const all = await db.listReceipts("a", 10);
      expect(all.map((r) => r.id)).toEqual([3, 2, 1]);
      expect(all[0].status).toBe("error");
      expect((await db.listReceipts("a", 1, 3)).map((r) => r.id)).toEqual([2]);
    });

    it("claims each signature once", async () => {
      expect(await db.claim("a", "sig1")).toBe(true);
      expect(await db.claim("a", "sig1")).toBe(false);
      expect(await db.claim("b", "sig1")).toBe(true);
    });

    it("adds up AI usage per project and per server", async () => {
      await db.addAiUsage("a", "2026-10-02", 2, 0.002);
      await db.addAiUsage("a", "2026-10-02", 1, 0.001);
      await db.addAiUsage("b", "2026-10-02", 5, 0.005);
      expect((await db.aiUsage("a", "2026-10-02")).calls).toBe(3);
      const all = await db.aiUsage(null, "2026-10-02");
      expect(all.calls).toBe(8);
      expect(all.usd).toBeCloseTo(0.008);
      expect((await db.aiUsage(null, "2026-10-03")).calls).toBe(0);
    });

    it("adds up AI fuel: fees earned and AI spent, all time, per project", async () => {
      await db.addFees("f", "2026-10-01", 0.5);
      await db.addFees("f", "2026-10-02", 0.25);
      await db.addAiUsage("f", "2026-10-02", 3, 0.003);
      await db.addFees("b", "2026-10-02", 9);
      const t = await db.fuelTotals("f");
      expect(t.feesUsd).toBeCloseTo(0.75);
      expect(t.spentUsd).toBeCloseTo(0.003);
      expect(t.calls).toBe(3);
      expect(await db.fuelTotals("nobody")).toEqual({ feesUsd: 0, spentUsd: 0, calls: 0 });
    });

    it("keeps proof on the project, and batches each finished receipt exactly once", async () => {
      await db.saveProject(project("z", { slug: "slug-z", proof: { creator: null, rules: [{ version: 1, fingerprint: "ab".repeat(32), signature: "sig", slot: 1, at: 2 }] } }));
      expect((await db.getProject("z"))!.proof!.rules![0].version).toBe(1);
      await db.addReceipts("z", [receipt(1), receipt(2), { ...receipt(3), finishedAt: null }]);
      const first = (await db.claimBatch(100, 5000))!;
      const mine = first.items.filter((i) => i.projectId === "z").map((i) => i.receipt.id);
      expect(mine).toEqual([1, 2]); // unfinished receipt 3 waits
      expect((await db.claimBatch(100, 5001))?.items.some((i) => i.projectId === "z") ?? false).toBe(false);
      await db.updateBatch(first.batch.id, { root: "cd".repeat(32), leaves: ["x", "y"], status: "sent", signature: "batchsig", sentAt: 5002 });
      expect(await db.getBatch(first.batch.id)).toMatchObject({ status: "sent", signature: "batchsig", leaves: ["x", "y"] });
      expect((await db.openBatches()).map((b) => b.id)).toContain(first.batch.id);
      expect(Object.keys(await db.receiptAnchors("z", [1, 2, 3])).map(Number)).toEqual([1, 2]);
      // Anchored receipts are final.
      await db.addReceipts("z", [{ ...receipt(1), steps: 42 }]);
      expect((await db.listReceipts("z", 5)).find((r) => r.id === 1)!.steps).toBe(1);
      // A failed batch frees its receipts.
      await db.releaseBatch(first.batch.id);
      expect((await db.getBatch(first.batch.id))!.status).toBe("failed");
      expect(await db.receiptAnchors("z", [1, 2])).toEqual({});
      expect((await db.claimBatch(100, 5003))!.items.filter((i) => i.projectId === "z")).toHaveLength(2);
      expect((await db.latestBatch())!.id).toBeGreaterThan(first.batch.id);
      await db.deleteProject("z");
    });

    it("reset and delete remove a project's world", async () => {
      await db.resetState("a");
      expect(await db.getState("a")).toBeNull();
      expect(await db.listReceipts("a", 10)).toEqual([]);
      expect(await db.claim("a", "sig1")).toBe(true);
      await db.deleteProject("b");
      expect(await db.getProject("b")).toBeNull();
    });
  });
}

contract("memory store", async () => memoryDb());

const pgUrl = process.env.CIRCUIT_TEST_DATABASE_URL;
if (!pgUrl) describe.skip("postgres store (set CIRCUIT_TEST_DATABASE_URL)", () => it("skipped", () => {}));
else contract("postgres store", async () => {
  const db = pgDb(pgUrl!);
  await db.listProjects({ limit: 1 }); // creates the schema
  const postgres = (await import("postgres")).default;
  const sql = postgres(pgUrl!, { onnotice: () => {} });
  await sql`truncate circuit.projects, circuit.project_state, circuit.receipts, circuit.seen, circuit.ai_usage cascade`;
  await sql.end();
  return db;
});
