/**
 * Postgres store (Supabase in production: use the "Transaction pooler"
 * connection string as DATABASE_URL). Tables live in their own `circuit`
 * schema, which Supabase's public REST API doesn't expose, and are created on
 * first use, so there's no SQL to paste anywhere.
 */
import postgres from "postgres";
import type { Program } from "@/lib/ir";
import { readSetup } from "@/lib/project/storage";
import type { Receipt, RuntimeState } from "@/lib/runtime/state";
import type { Db, ProjectProof, ProofBatch, ProjectQuery, ReceiptAnchor, RunMeta, ServerProject, StateRow } from "./types";
import { emptyMeta } from "./types";

export const SCHEMA = `
create schema if not exists circuit;

create table if not exists circuit.projects (
  id text primary key,
  slug text not null unique,
  owner text not null,
  name text not null,
  program jsonb not null,
  setup jsonb not null,
  live boolean not null default false,
  timezone text not null default 'UTC',
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists projects_owner on circuit.projects (owner);
create index if not exists projects_token on circuit.projects ((setup->>'tokenAddress')) where live;
create index if not exists projects_wallet on circuit.projects ((setup->>'walletAddress')) where live;

create table if not exists circuit.project_state (
  project_id text primary key references circuit.projects (id) on delete cascade,
  state jsonb not null,
  meta jsonb not null default '{}'::jsonb,
  version integer not null,
  updated_at timestamptz not null default now()
);

create table if not exists circuit.receipts (
  project_id text not null references circuit.projects (id) on delete cascade,
  id integer not null,
  started_at bigint not null,
  receipt jsonb not null,
  primary key (project_id, id)
);

create table if not exists circuit.seen (
  project_id text not null references circuit.projects (id) on delete cascade,
  signature text not null,
  at timestamptz not null default now(),
  primary key (project_id, signature)
);

create table if not exists circuit.ai_usage (
  project_id text not null,
  day date not null,
  calls integer not null default 0,
  usd double precision not null default 0,
  primary key (project_id, day)
);
-- AI fuel: creator fees the coin earned that day (USD).
alter table circuit.ai_usage add column if not exists fees_usd double precision not null default 0;
-- (Older databases also have projects.ai_daily_usd, a chosen AI cap that is no longer used.)

-- Proof on Solana: creator check and rules versions per project; receipt batches.
alter table circuit.projects add column if not exists proof jsonb not null default '{}'::jsonb;
create table if not exists circuit.batches (
  id serial primary key,
  root text not null default '',
  leaves jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  signature text,
  slot bigint,
  created_at bigint not null,
  sent_at bigint
);
alter table circuit.receipts add column if not exists batch_id integer;
alter table circuit.receipts add column if not exists leaf_index integer;
create index if not exists receipts_unanchored on circuit.receipts (started_at) where batch_id is null;
create index if not exists receipts_batch on circuit.receipts (batch_id);
`;

type Row = Record<string, unknown>;

const toProject = (r: Row): ServerProject => ({
  id: r.id as string,
  slug: r.slug as string,
  owner: r.owner as string,
  name: r.name as string,
  program: r.program as Program,
  setup: readSetup(r.setup),
  live: r.live as boolean,
  timezone: r.timezone as string,
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
  proof: (r.proof ?? {}) as ProjectProof,
});

const toBatch = (r: Row): ProofBatch => ({
  id: Number(r.id),
  root: r.root as string,
  leaves: (r.leaves ?? []) as string[],
  status: r.status as ProofBatch["status"],
  signature: (r.signature as string | null) ?? null,
  slot: r.slot === null || r.slot === undefined ? null : Number(r.slot),
  createdAt: Number(r.created_at),
  sentAt: r.sent_at === null || r.sent_at === undefined ? null : Number(r.sent_at),
});

export function pgDb(url: string): Db {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const sql = postgres(url, {
    // Supabase's transaction pooler doesn't support prepared statements.
    prepare: false,
    max: Number(process.env.CIRCUIT_DB_POOL) || 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: local ? false : "require",
    onnotice: () => {},
  });
  const json = (v: unknown) => sql.json(v as postgres.JSONValue);

  let ready: Promise<unknown> | null = null;
  const init = () => (ready ??= sql.unsafe(SCHEMA).catch((e) => {
    ready = null; // retry next time
    throw e;
  }));
  /** Every query waits for the schema the first time. */
  const q = async <T>(run: () => Promise<T>) => {
    await init();
    return run();
  };

  return {
    kind: "postgres",

    getProject: (id) => q(async () => {
      const [r] = await sql`select * from circuit.projects where id = ${id}`;
      return r ? toProject(r) : null;
    }),
    getProjectBySlug: (slug) => q(async () => {
      const [r] = await sql`select * from circuit.projects where slug = ${slug}`;
      return r ? toProject(r) : null;
    }),
    saveProject: (p) => q(async () => {
      await sql`
        insert into circuit.projects (id, slug, owner, name, program, setup, live, timezone, created_at, updated_at, proof)
        values (${p.id}, ${p.slug}, ${p.owner}, ${p.name}, ${json(p.program)}, ${json(p.setup)}, ${p.live}, ${p.timezone}, ${p.createdAt}, ${p.updatedAt}, ${json(p.proof ?? {})})
        on conflict (id) do update set
          slug = excluded.slug, owner = excluded.owner, name = excluded.name, program = excluded.program,
          setup = excluded.setup, live = excluded.live,
          timezone = excluded.timezone, updated_at = excluded.updated_at, proof = excluded.proof`;
    }),
    deleteProject: (id) => q(async () => {
      await sql`delete from circuit.projects where id = ${id}`;
    }),
    listProjects: (f: ProjectQuery) => q(async () => {
      const rows = await sql`
        select * from circuit.projects
        where true
          ${f.owner !== undefined ? sql`and owner = ${f.owner}` : sql``}
          ${f.live !== undefined ? sql`and live = ${f.live}` : sql``}
          ${f.address !== undefined ? sql`and live and (setup->>'tokenAddress' = ${f.address} or setup->>'walletAddress' = ${f.address})` : sql``}
        order by updated_at desc
        limit ${f.limit ?? 500}`;
      return rows.map(toProject);
    }),

    getState: (projectId) => q(async () => {
      const [r] = await sql`select state, meta, version from circuit.project_state where project_id = ${projectId}`;
      return r ? ({ state: r.state as RuntimeState, meta: { ...emptyMeta(), ...(r.meta as RunMeta) }, version: r.version as number } satisfies StateRow) : null;
    }),
    putState: (projectId, state, meta, expected) => q(async () => {
      const rows =
        expected === 0
          ? await sql`
              insert into circuit.project_state (project_id, state, meta, version)
              values (${projectId}, ${json(state)}, ${json(meta)}, 1)
              on conflict (project_id) do nothing
              returning version`
          : await sql`
              update circuit.project_state
              set state = ${json(state)}, meta = ${json(meta)}, version = version + 1, updated_at = now()
              where project_id = ${projectId} and version = ${expected}
              returning version`;
      return rows.length === 1;
    }),
    resetState: (projectId) => q(async () => {
      await sql.begin(async (tx) => {
        await tx`delete from circuit.project_state where project_id = ${projectId}`;
        await tx`delete from circuit.receipts where project_id = ${projectId}`;
        await tx`delete from circuit.seen where project_id = ${projectId}`;
      });
    }),

    addReceipts: (projectId, receipts) => q(async () => {
      if (!receipts.length) return;
      const rows = receipts.map((r) => ({ project_id: projectId, id: r.id, started_at: r.startedAt, receipt: json(r) }));
      // An anchored receipt is final: its fingerprint is on Solana.
      await sql`
        insert into circuit.receipts ${sql(rows, "project_id", "id", "started_at", "receipt")}
        on conflict (project_id, id) do update set receipt = excluded.receipt
        where circuit.receipts.batch_id is null`;
    }),
    listReceipts: (projectId, limit, beforeId) => q(async () => {
      const rows = await sql`
        select receipt from circuit.receipts
        where project_id = ${projectId} ${beforeId !== undefined ? sql`and id < ${beforeId}` : sql``}
        order by id desc limit ${limit}`;
      return rows.map((r) => r.receipt as Receipt);
    }),

    claimBatch: (limit, now) => q(async () =>
      sql.begin(async (tx) => {
        // SKIP LOCKED: two cron ticks at once never put a receipt in two batches.
        const rows = await tx`
          select project_id, id, receipt from circuit.receipts
          where batch_id is null and receipt->>'finishedAt' is not null
          order by started_at, id limit ${limit}
          for update skip locked`;
        if (!rows.length) return null;
        const [b] = await tx`insert into circuit.batches (created_at) values (${now}) returning *`;
        const marks = rows.map((r, i) => ({ project_id: r.project_id as string, id: Number(r.id), leaf_index: i }));
        await tx`
          update circuit.receipts as r set batch_id = ${b.id}, leaf_index = m.leaf_index::int
          from (values ${tx(marks.map((m) => [m.project_id, m.id, m.leaf_index]))}) as m (project_id, id, leaf_index)
          where r.project_id = m.project_id and r.id = m.id::int`;
        return { batch: toBatch(b), items: rows.map((r) => ({ projectId: r.project_id as string, receipt: r.receipt as Receipt })) };
      }),
    ),
    updateBatch: (id, patch) => q(async () => {
      const row: Record<string, unknown> = {};
      if (patch.root !== undefined) row.root = patch.root;
      if (patch.leaves !== undefined) row.leaves = json(patch.leaves);
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.signature !== undefined) row.signature = patch.signature;
      if (patch.slot !== undefined) row.slot = patch.slot;
      if (patch.sentAt !== undefined) row.sent_at = patch.sentAt;
      if (!Object.keys(row).length) return;
      await sql`update circuit.batches set ${sql(row)} where id = ${id}`;
    }),
    releaseBatch: (id) => q(async () => {
      await sql.begin(async (tx) => {
        await tx`update circuit.batches set status = 'failed' where id = ${id}`;
        await tx`update circuit.receipts set batch_id = null, leaf_index = null where batch_id = ${id}`;
      });
    }),
    openBatches: () => q(async () => (await sql`select * from circuit.batches where status in ('pending', 'sent') order by id`).map(toBatch)),
    latestBatch: () => q(async () => {
      const [r] = await sql`select * from circuit.batches order by id desc limit 1`;
      return r ? toBatch(r) : null;
    }),
    getBatch: (id) => q(async () => {
      const [r] = await sql`select * from circuit.batches where id = ${id}`;
      return r ? toBatch(r) : null;
    }),
    receiptAnchors: (projectId, receiptIds) => q(async () => {
      if (!receiptIds.length) return {};
      const rows = await sql`
        select id, batch_id, leaf_index from circuit.receipts
        where project_id = ${projectId} and id in ${sql(receiptIds)} and batch_id is not null`;
      const out: Record<number, ReceiptAnchor> = {};
      for (const r of rows) out[Number(r.id)] = { batchId: Number(r.batch_id), index: Number(r.leaf_index) };
      return out;
    }),

    claim: (projectId, signature) => q(async () => {
      const rows = await sql`
        insert into circuit.seen (project_id, signature) values (${projectId}, ${signature})
        on conflict do nothing returning signature`;
      return rows.length === 1;
    }),

    addAiUsage: (projectId, day, calls, usd) => q(async () => {
      await sql`
        insert into circuit.ai_usage (project_id, day, calls, usd) values (${projectId}, ${day}, ${calls}, ${usd})
        on conflict (project_id, day) do update set calls = circuit.ai_usage.calls + excluded.calls, usd = circuit.ai_usage.usd + excluded.usd`;
    }),
    aiUsage: (projectId, day) => q(async () => {
      const [r] = await sql`
        select coalesce(sum(calls), 0)::int as calls, coalesce(sum(usd), 0)::float8 as usd
        from circuit.ai_usage where day = ${day} ${projectId !== null ? sql`and project_id = ${projectId}` : sql``}`;
      return { calls: Number(r.calls), usd: Number(r.usd) };
    }),
    addFees: (projectId, day, usd) => q(async () => {
      await sql`
        insert into circuit.ai_usage (project_id, day, fees_usd) values (${projectId}, ${day}, ${usd})
        on conflict (project_id, day) do update set fees_usd = circuit.ai_usage.fees_usd + excluded.fees_usd`;
    }),
    fuelTotals: (projectId) => q(async () => {
      const [r] = await sql`
        select coalesce(sum(fees_usd), 0)::float8 as fees, coalesce(sum(usd), 0)::float8 as usd, coalesce(sum(calls), 0)::int as calls
        from circuit.ai_usage where project_id = ${projectId}`;
      return { feesUsd: Number(r.fees), spentUsd: Number(r.usd), calls: Number(r.calls) };
    }),

    close: () => sql.end({ timeout: 5 }),
  };
}
