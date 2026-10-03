/**
 * The server's store: Postgres when DATABASE_URL is set (Supabase in
 * production), otherwise a JSON file in .circuit-data/ for local development.
 * One instance per process (kept on globalThis so dev hot reloads reuse it).
 */
import { join } from "node:path";
import { memoryDb } from "./memoryDb";
import { pgDb } from "./pgDb";
import type { Db } from "./types";

const g = globalThis as { __circuitDb?: Db; __circuitDbCode?: number };
/**
 * Bump when the Db interface gains methods: a dev server hot-reloading newer
 * code then builds a fresh store instead of reusing one made by older code
 * (the file store re-reads its file, so nothing is lost).
 */
const DB_CODE = 2;

export function getDb(): Db {
  if (g.__circuitDb && g.__circuitDbCode === DB_CODE) return g.__circuitDb;
  void g.__circuitDb?.close?.().catch(() => {});
  g.__circuitDbCode = DB_CODE;
  const url = process.env.DATABASE_URL;
  if (url) return (g.__circuitDb = pgDb(url));
  if (process.env.VERCEL) throw new Error("DATABASE_URL is not set: a deployed CIRCUIT needs a database (Supabase).");
  return (g.__circuitDb = memoryDb(join(process.cwd(), ".circuit-data", "db.json")));
}

/** Tests: use this store instead. */
export function setDb(db: Db | undefined) {
  g.__circuitDb = db;
  g.__circuitDbCode = db ? DB_CODE : undefined;
}
