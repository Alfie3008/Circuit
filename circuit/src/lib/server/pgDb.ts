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
import type { Db, ProjectQuery, RunMeta, ServerProject, StateRow } from "./types";
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
        insert into circuit.projects (id, slug, owner, name, program, setup, live, timezone, created_at, updated_at)
        values (${p.id}, ${p.slug}, ${p.owner}, ${p.name}, ${json(p.program)}, ${json(p.setup)}, ${p.live}, ${p.timezone}, ${p.createdAt}, ${p.updatedAt})
        on conflict (id) do update set
          slug = excluded.slug, owner = excluded.owner, name = excluded.name, program = excluded.program,
          setup = excluded.setup, live = excluded.live,
          timezone = excluded.timezone, updated_at = excluded.updated_at`;
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
      await sql`
        insert into circuit.receipts ${sql(rows, "project_id", "id", "started_at", "receipt")}
        on conflict (project_id, id) do update set receipt = excluded.receipt`;
    }),
    listReceipts: (projectId, limit, beforeId) => q(async () => {
      const rows = await sql`
        select receipt from circuit.receipts
        where project_id = ${projectId} ${beforeId !== undefined ? sql`and id < ${beforeId}` : sql``}
        order by id desc limit ${limit}`;
      return rows.map((r) => r.receipt as Receipt);
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
