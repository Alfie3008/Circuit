/**
 * In-process store for development and tests. With a file path it persists to
 * one JSON file (written atomically after each change), so `npm run dev`
 * keeps published projects across restarts without any database. It is for
 * a single process only: production uses Postgres (Supabase).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Receipt, RuntimeState } from "@/lib/runtime/state";
import type { Db, ProofBatch, ProjectQuery, ReceiptAnchor, RunMeta, ServerProject, StateRow } from "./types";

interface Data {
  projects: Record<string, ServerProject>;
  states: Record<string, StateRow>;
  receipts: Record<string, Record<number, Receipt>>;
  seen: Record<string, string[]>;
  usage: Record<string, { calls: number; usd: number; feesUsd?: number }>;
  batches: ProofBatch[];
  /** "projectId|receiptId" → its place in a batch. */
  anchors: Record<string, ReceiptAnchor>;
}

/** Signatures remembered per project (oldest are forgotten). */
const MAX_SEEN = 5000;
/** Receipts kept per project. */
const MAX_RECEIPTS = 2000;

const clone = <T>(v: T): T => structuredClone(v);

export function memoryDb(file?: string): Db {
  let data: Data = { projects: {}, states: {}, receipts: {}, seen: {}, usage: {}, batches: [], anchors: {} };
  if (file) {
    try {
      data = { ...data, ...(JSON.parse(readFileSync(file, "utf8")) as Partial<Data>) };
    } catch {
      // No file yet (or unreadable): start empty.
    }
  }

  const persist = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, file);
  };

  const dropAnchors = (projectId: string) => {
    for (const k of Object.keys(data.anchors)) if (k.startsWith(`${projectId}|`)) delete data.anchors[k];
  };

  const watches = (p: ServerProject, address: string) => p.setup.tokenAddress === address || p.setup.walletAddress === address;

  return {
    kind: file ? "file" : "memory",

    async getProject(id) {
      return data.projects[id] ? clone(data.projects[id]) : null;
    },
    async getProjectBySlug(slug) {
      const p = Object.values(data.projects).find((x) => x.slug === slug);
      return p ? clone(p) : null;
    },
    async saveProject(project) {
      const clash = Object.values(data.projects).find((x) => x.slug === project.slug && x.id !== project.id);
      if (clash) throw new Error(`duplicate slug ${project.slug}`);
      data.projects[project.id] = clone(project);
      persist();
    },
    async deleteProject(id) {
      delete data.projects[id];
      delete data.states[id];
      delete data.receipts[id];
      delete data.seen[id];
      dropAnchors(id);
      persist();
    },
    async listProjects(q: ProjectQuery) {
      return Object.values(data.projects)
        .filter((p) => (q.owner === undefined || p.owner === q.owner) && (q.live === undefined || p.live === q.live))
        .filter((p) => q.address === undefined || (p.live && watches(p, q.address)))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, q.limit ?? 500)
        .map(clone);
    },

    async getState(projectId) {
      return data.states[projectId] ? clone(data.states[projectId]) : null;
    },
    async putState(projectId, state: RuntimeState, meta: RunMeta, expected) {
      const current = data.states[projectId]?.version ?? 0;
      if (current !== expected) return false;
      data.states[projectId] = { state: clone(state), meta: clone(meta), version: current + 1 };
      persist();
      return true;
    },
    async resetState(projectId) {
      delete data.states[projectId];
      delete data.receipts[projectId];
      delete data.seen[projectId];
      dropAnchors(projectId);
      persist();
    },

    async addReceipts(projectId, receipts) {
      const map = (data.receipts[projectId] ??= {});
      // An anchored receipt is final: its fingerprint is on Solana.
      for (const r of receipts) if (!data.anchors[`${projectId}|${r.id}`]) map[r.id] = clone(r);
      const ids = Object.keys(map).map(Number).sort((a, b) => a - b);
      for (const id of ids.slice(0, Math.max(0, ids.length - MAX_RECEIPTS))) delete map[id];
      persist();
    },
    async listReceipts(projectId, limit, beforeId) {
      return Object.values(data.receipts[projectId] ?? {})
        .filter((r) => beforeId === undefined || r.id < beforeId)
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map(clone);
    },

    async claimBatch(limit, now) {
      const items: { projectId: string; receipt: Receipt }[] = [];
      for (const [projectId, map] of Object.entries(data.receipts))
        for (const r of Object.values(map)) if (r.finishedAt !== null && !data.anchors[`${projectId}|${r.id}`]) items.push({ projectId, receipt: r });
      if (!items.length) return null;
      items.sort((a, b) => a.receipt.startedAt - b.receipt.startedAt || a.receipt.id - b.receipt.id);
      const take = items.slice(0, limit);
      const batch: ProofBatch = { id: (data.batches.at(-1)?.id ?? 0) + 1, root: "", leaves: [], status: "pending", signature: null, slot: null, createdAt: now, sentAt: null };
      data.batches.push(batch);
      take.forEach((it, index) => (data.anchors[`${it.projectId}|${it.receipt.id}`] = { batchId: batch.id, index }));
      persist();
      return { batch: clone(batch), items: take.map(clone) };
    },
    async updateBatch(id, patch) {
      const b = data.batches.find((x) => x.id === id);
      if (b) Object.assign(b, clone(patch));
      persist();
    },
    async releaseBatch(id) {
      const b = data.batches.find((x) => x.id === id);
      if (b) b.status = "failed";
      for (const [k, a] of Object.entries(data.anchors)) if (a.batchId === id) delete data.anchors[k];
      persist();
    },
    async openBatches() {
      return data.batches.filter((b) => b.status === "pending" || b.status === "sent").map(clone);
    },
    async latestBatch() {
      const b = data.batches.at(-1);
      return b ? clone(b) : null;
    },
    async getBatch(id) {
      const b = data.batches.find((x) => x.id === id);
      return b ? clone(b) : null;
    },
    async receiptAnchors(projectId, receiptIds) {
      const out: Record<number, ReceiptAnchor> = {};
      for (const id of receiptIds) {
        const a = data.anchors[`${projectId}|${id}`];
        if (a) out[id] = { ...a };
      }
      return out;
    },

    async claim(projectId, signature) {
      const seen = (data.seen[projectId] ??= []);
      if (seen.includes(signature)) return false;
      seen.push(signature);
      if (seen.length > MAX_SEEN) seen.splice(0, seen.length - MAX_SEEN);
      persist();
      return true;
    },

    async addAiUsage(projectId, day, calls, usd) {
      const u = (data.usage[`${projectId}|${day}`] ??= { calls: 0, usd: 0 });
      u.calls += calls;
      u.usd += usd;
      persist();
    },
    async aiUsage(projectId, day) {
      let calls = 0;
      let usd = 0;
      for (const [k, u] of Object.entries(data.usage)) {
        const [p, d] = k.split("|");
        if (d === day && (projectId === null || p === projectId)) {
          calls += u.calls;
          usd += u.usd;
        }
      }
      return { calls, usd };
    },
    async addFees(projectId, day, usd) {
      const u = (data.usage[`${projectId}|${day}`] ??= { calls: 0, usd: 0 });
      u.feesUsd = (u.feesUsd ?? 0) + usd;
      persist();
    },
    async fuelTotals(projectId) {
      const t = { feesUsd: 0, spentUsd: 0, calls: 0 };
      for (const [k, u] of Object.entries(data.usage)) {
        if (k.split("|")[0] !== projectId) continue;
        t.feesUsd += u.feesUsd ?? 0;
        t.spentUsd += u.usd;
        t.calls += u.calls;
      }
      return t;
    },
  };
}
