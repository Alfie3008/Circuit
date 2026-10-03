/**
 * Publishing: what owners can do to their projects on the server, with every
 * input checked here (the browser is never trusted).
 */
import { z } from "zod";
import { parseProgram, plainIssues } from "@/lib/ir";
import { readSetup } from "@/lib/project/storage";
import { isAddress } from "@/lib/chain/parse";
import { initialState } from "@/lib/runtime/state";
import { hash } from "@/lib/runtime/rng";
import { invalidateLive } from "./chainFeed";
import { syncWebhook, type SyncResult } from "./helius";
import { emptyMeta, ServerError, type Db, type ServerProject } from "./types";

const RESERVED = new Set(["new", "edit", "admin", "api", "app", "circuit", "settings", "login", "about", "help", "p"]);

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function checkSlug(slug: string): string {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) throw new ServerError("The page name needs 3–40 letters, numbers or dashes.");
  if (RESERVED.has(slug)) throw new ServerError(`"${slug}" is reserved. Pick another page name.`);
  return slug;
}

const validZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const PublishSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{4,64}$/),
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().toLowerCase(),
  program: z.unknown(),
  setup: z.unknown(),
  timezone: z.string().max(64).optional(),
});

/** Publishes (or republishes) a project. The program is re-validated here. */
export async function publish(db: Db, owner: string, input: unknown, now = Date.now()): Promise<ServerProject> {
  const body = PublishSchema.safeParse(input);
  if (!body.success) throw new ServerError("That publish request isn't valid.");
  const { id, name } = body.data;
  const slug = checkSlug(body.data.slug);
  const parsed = parseProgram(body.data.program);
  if (!parsed.ok) throw new ServerError(`The program has a problem, so it can't be published yet:\n${plainIssues(body.data.program, parsed.issues)}`);
  const setup = readSetup(body.data.setup);
  if (setup.launchMode === "existing") {
    if (setup.tokenAddress && !isAddress(setup.tokenAddress)) throw new ServerError("The token address isn't a Solana address.");
    if (setup.walletAddress && !isAddress(setup.walletAddress)) throw new ServerError("The wallet address isn't a Solana address.");
  }

  const existing = await db.getProject(id);
  if (existing && existing.owner !== owner) throw new ServerError("This project belongs to another wallet.", 403);
  const clash = await db.getProjectBySlug(slug);
  if (clash && clash.id !== id) throw new ServerError(`circuit/p/${slug} is taken. Pick another page name.`, 409);
  const mine = existing ? 0 : (await db.listProjects({ owner, limit: 101 })).length;
  if (mine >= 100) throw new ServerError("You've reached 100 published projects.", 403);

  const timezone = body.data.timezone && validZone(body.data.timezone) ? body.data.timezone : (existing?.timezone ?? "UTC");
  const project: ServerProject = {
    id,
    slug,
    owner,
    name,
    program: parsed.program,
    setup,
    live: existing?.live ?? false,
    timezone,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await db.saveProject(project);
  // What the program watches may have changed.
  if (project.live) invalidateLive();
  return project;
}

export const SettingsSchema = z.object({
  live: z.boolean().optional(),
  reset: z.literal(true).optional(),
  layout: z.enum(["world", "gallery", "feed", "website"]).optional(),
});

export interface SettingsResult {
  project: ServerProject;
  webhook?: SyncResult;
}

/** Owner settings: go live / stop, page layout, reset the world. */
export async function updateSettings(db: Db, owner: string, id: string, input: unknown, now = Date.now()): Promise<SettingsResult> {
  const body = SettingsSchema.safeParse(input);
  if (!body.success) throw new ServerError("Those settings aren't valid.");
  const project = await ownProject(db, owner, id);
  const s = body.data;

  if (s.reset) await db.resetState(id);
  if (s.layout) project.setup = { ...project.setup, pageLayout: s.layout };

  const starting = s.live === true && !project.live;
  const stopping = s.live === false && project.live;
  if (s.live !== undefined) project.live = s.live;
  project.updatedAt = now;
  await db.saveProject(project);

  if (starting || s.reset) {
    // Going live starts the clock: timers count from now, and chain polling
    // starts from the current transaction (no replay of old activity).
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await db.getState(id);
      const state = row?.state ?? initialState(hash(id) % 2147483647);
      const meta = { ...emptyMeta(), ...(row?.meta ?? {}), liveSince: project.live ? now : null, lastTick: {}, cursor: {}, lastPollAt: undefined };
      if (await db.putState(id, state, meta, row?.version ?? 0)) break;
    }
  }
  if (starting || stopping) {
    invalidateLive();
    return { project, webhook: await syncWebhook(db) };
  }
  return { project };
}

export async function ownProject(db: Db, owner: string, id: string): Promise<ServerProject> {
  const project = await db.getProject(id);
  if (!project) throw new ServerError("That project isn't published.", 404);
  if (project.owner !== owner) throw new ServerError("This project belongs to another wallet.", 403);
  return project;
}

export async function unpublish(db: Db, owner: string, id: string) {
  const project = await ownProject(db, owner, id);
  await db.deleteProject(id);
  if (project.live) {
    invalidateLive();
    await syncWebhook(db);
  }
}
