/**
 * POST /api/dev/design-export: writes one file of the design export into
 * ./design-export (dev only, localhost only). Used by /dev/block-export.
 * Body: { reset: true } to empty the folder, or { path, data, encoding }.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isLocalRequest, readJson } from "@/lib/server/http";

const ROOT = resolve(process.cwd(), "design-export");

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" || !isLocalRequest(req)) return Response.json({ error: "Not available." }, { status: 404 });
  const body = (await readJson(req, 20 * 1024 * 1024)) as { reset?: boolean; path?: string; data?: string; encoding?: "utf8" | "base64" };
  if (body.reset) {
    await rm(ROOT, { recursive: true, force: true });
    await mkdir(ROOT, { recursive: true });
    return Response.json({ ok: true });
  }
  if (typeof body.path !== "string" || !/^[a-z0-9][a-z0-9_\-./]*$/i.test(body.path) || body.path.includes("..") || typeof body.data !== "string")
    return Response.json({ error: "Bad file." }, { status: 400 });
  const file = join(ROOT, body.path);
  if (!file.startsWith(ROOT)) return Response.json({ error: "Bad path." }, { status: 400 });
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, body.encoding === "base64" ? Buffer.from(body.data, "base64") : body.data);
  return Response.json({ ok: true });
}
