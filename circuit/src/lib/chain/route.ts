/** Shared handling for the /api/chain/* routes. */
import { guard } from "@/lib/ai/guard";
import { ChainError } from "./rpc";

/** Runs a chain read behind the guard, mapping errors to JSON responses. */
export async function chainRoute(req: Request, run: (params: URLSearchParams) => Promise<unknown>): Promise<Response> {
  const blocked = guard(req, "chain");
  if (blocked) return blocked;
  try {
    return Response.json(await run(new URL(req.url).searchParams));
  } catch (e) {
    const err = e instanceof ChainError ? e : new ChainError(e instanceof Error ? e.message : "Unexpected chain error", 500);
    return Response.json({ error: err.message }, { status: err.status });
  }
}

/** Integer query param, clamped. */
export function intParam(params: URLSearchParams, name: string, fallback: number, min: number, max: number) {
  const n = Math.floor(Number(params.get(name) ?? fallback));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
