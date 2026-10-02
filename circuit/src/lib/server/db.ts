/**
 * The server's store: Postgres when DATABASE_URL is set (Supabase in
 * production), otherwise a JSON file in .circuit-data/ for local development.
 * One instance per process (kept on globalThis so dev hot reloads reuse it).
 */
import { join } from "node:path";
import { memoryDb } from "./memoryDb";
import { pgDb } from "./pgDb";
import type { Db } from "./types";

const g = globalThis as { __circuitDb?: Db };

export function getDb(): Db {
  if (g.__circuitDb) return g.__circuitDb;
  const url = process.env.DATABASE_URL;
  if (url) return (g.__circuitDb = pgDb(url));
  if (process.env.VERCEL) throw new Error("DATABASE_URL is not set: a deployed CIRCUIT needs a database (Supabase).");
  return (g.__circuitDb = memoryDb(join(process.cwd(), ".circuit-data", "db.json")));
}

/** Tests: use this store instead. */
export function setDb(db: Db | undefined) {
  g.__circuitDb = db;
}
