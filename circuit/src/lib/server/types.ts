/**
 * What the always-on server keeps per project. A project is PUBLISHED by its
 * owner (a wallet); a published project has a public page at /p/<slug> and,
 * when `live`, runs on the server on real events and timers.
 */
import type { Program } from "@/lib/ir";
import type { ProjectSetup } from "@/lib/project/storage";
import type { Receipt, RuntimeState } from "@/lib/runtime/state";

export interface ServerProject {
  id: string;
  slug: string;
  /** Owner's wallet address (Sign in with Solana). */
  owner: string;
  name: string;
  program: Program;
  setup: ProjectSetup;
  /** Running on the server (events and timers), not just published. */
  live: boolean;
  /** Most the project's AI blocks may spend per day (USD). */
  aiDailyUsd: number;
  /** IANA time zone for "at time" scripts, e.g. Europe/London. */
  timezone: string;
  createdAt: number;
  updatedAt: number;
}

/** Server-side bookkeeping that isn't part of the program's world. */
export interface RunMeta {
  /** Timers: minutes → last fire time. */
  lastTick: Record<string, number>;
  /** "at time" scripts: hat id → day (YYYY-MM-DD) it last fired. */
  firedOn: Record<string, string>;
  /** Newest chain signatures already handled, for polling. */
  cursor: { mint?: string; wallet?: string };
  lastPollAt?: number;
  liveSince: number | null;
  lastEventAt: number | null;
  lastError: string | null;
  /** Events dropped because the project hit its per-minute run limit. */
  dropped: number;
  /** Executions in the current minute (for the per-minute limit). */
  window?: { minute: number; runs: number };
}

export const emptyMeta = (): RunMeta => ({ lastTick: {}, firedOn: {}, cursor: {}, liveSince: null, lastEventAt: null, lastError: null, dropped: 0 });

export interface StateRow {
  state: RuntimeState;
  meta: RunMeta;
  /** Increases on every write; writes check it so two runners can't clobber each other. */
  version: number;
}

export interface ProjectQuery {
  owner?: string;
  live?: boolean;
  /** Live projects watching this token or wallet. */
  address?: string;
  limit?: number;
}

export interface Db {
  readonly kind: "postgres" | "file" | "memory";
  getProject(id: string): Promise<ServerProject | null>;
  getProjectBySlug(slug: string): Promise<ServerProject | null>;
  /** Insert or replace. */
  saveProject(project: ServerProject): Promise<void>;
  deleteProject(id: string): Promise<void>;
  listProjects(query: ProjectQuery): Promise<ServerProject[]>;

  getState(projectId: string): Promise<StateRow | null>;
  /** Writes if the stored version is still `expected` (0 = no row yet). False on conflict. */
  putState(projectId: string, state: RuntimeState, meta: RunMeta, expected: number): Promise<boolean>;
  /** Discards the project's world (state, receipts, seen events). */
  resetState(projectId: string): Promise<void>;

  /** Stores receipts (by project + receipt id, so re-storing one updates it). */
  addReceipts(projectId: string, receipts: Receipt[]): Promise<void>;
  /** Newest first. */
  listReceipts(projectId: string, limit: number, beforeId?: number): Promise<Receipt[]>;

  /** Marks a chain transaction as handled for a project. False if it already was. */
  claim(projectId: string, signature: string): Promise<boolean>;

  addAiUsage(projectId: string, day: string, calls: number, usd: number): Promise<void>;
  /** AI usage on a day, for one project or (null) the whole server. */
  aiUsage(projectId: string | null, day: string): Promise<{ calls: number; usd: number }>;

  close?(): Promise<void>;
}

/** Thrown for problems the caller should show (bad input, not found, forbidden). */
export class ServerError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
