/**
 * Protection for the AI routes, which spend real money once a key is set:
 *
 * - Password: if CIRCUIT_AI_PASSWORD is set, requests must send it in the
 *   `x-circuit-password` header. If it is NOT set, only requests to localhost
 *   are served, so a deployment without a password can't be used by others.
 * - Rate limits per client and a daily cap for the whole server.
 *
 * Counters are in memory: they reset when the server restarts. That's enough
 * for one dev server or a single instance; a multi-instance deployment needs
 * a shared store (part of the always-on server work).
 */
import { timingSafeEqual } from "node:crypto";

export type RouteKind = "compile" | "runtime";

const envInt = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/** Requests per minute per client. */
export const limits = () => ({
  compile: envInt("CIRCUIT_AI_RATE_LIMIT", 10),
  runtime: envInt("CIRCUIT_AI_RUNTIME_RATE_LIMIT", 60),
  daily: envInt("CIRCUIT_AI_DAILY_LIMIT", 1000),
});

const windows = new Map<string, number[]>();
let day = "";
let dayCount = 0;

export const passwordRequired = () => !!process.env.CIRCUIT_AI_PASSWORD;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}

function samePassword(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const json = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers });

/** Null if the request may proceed, otherwise the error response to send. */
export function guard(req: Request, kind: RouteKind, now = Date.now()): Response | null {
  const expected = process.env.CIRCUIT_AI_PASSWORD;
  if (expected) {
    const given = req.headers.get("x-circuit-password") ?? "";
    if (!samePassword(given, expected)) return json(401, { error: "This CIRCUIT needs a password for AI features.", needsPassword: true });
  } else if (!LOCAL_HOSTS.has(new URL(req.url).hostname)) {
    return json(403, { error: "AI routes are disabled: set CIRCUIT_AI_PASSWORD before deploying." });
  }

  const { compile, runtime, daily } = limits();
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (dayCount >= daily) return json(429, { error: "Daily AI limit reached for this server." }, { "retry-after": "3600" });

  const key = `${kind}:${clientKey(req)}`;
  const recent = (windows.get(key) ?? []).filter((t) => now - t < 60_000);
  const max = kind === "compile" ? compile : runtime;
  if (recent.length >= max) {
    const retry = Math.ceil((60_000 - (now - recent[0])) / 1000);
    return json(429, { error: `Too many AI requests. Try again in ${retry}s.` }, { "retry-after": String(retry) });
  }
  recent.push(now);
  windows.set(key, recent);
  dayCount += 1;
  return null;
}

/** Test helper. */
export function resetGuard() {
  windows.clear();
  day = "";
  dayCount = 0;
}
