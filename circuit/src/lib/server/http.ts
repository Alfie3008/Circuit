/** Shared plumbing for the server's API routes. */
import { requestWallet } from "./auth";
import { ServerError } from "./types";

/** Runs a handler, turning thrown errors into JSON responses. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ServerError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[circuit] server error:", e);
    return Response.json({ error: "Something went wrong on the server." }, { status: 500 });
  }
}

/** Parses a JSON body, refusing anything over `maxBytes`. */
export async function readJson(req: Request, maxBytes = 512 * 1024): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new ServerError("Request is too large.", 413);
  const text = await req.text();
  if (text.length > maxBytes) throw new ServerError("Request is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new ServerError("Expected a JSON body.");
  }
}

/** The signed-in wallet, or a 401. */
export function requireWallet(req: Request): string {
  const wallet = requestWallet(req);
  if (!wallet) throw new ServerError("Sign in with your wallet first.", 401);
  return wallet;
}

const windows = new Map<string, number[]>();

/** Sliding one-minute limit per key (in memory: per server instance). */
export function rateLimit(key: string, perMinute: number, now = Date.now()) {
  const recent = (windows.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= perMinute) throw new ServerError("Too many requests. Try again in a minute.", 429);
  recent.push(now);
  windows.set(key, recent);
  if (windows.size > 10_000) for (const [k, v] of windows) if (!v.some((t) => now - t < 60_000)) windows.delete(k);
}

export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
export const isLocalRequest = (req: Request) => LOCAL_HOSTS.has(new URL(req.url).hostname);
