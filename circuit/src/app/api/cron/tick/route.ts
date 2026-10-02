/**
 * GET /api/cron/tick: called every minute by Vercel Cron (vercel.json), or by
 * `npm run cron` locally. Fires due timers and polls the chain for live projects.
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without a secret, only
 * localhost may call it.
 */
import { getDb } from "@/lib/server/db";
import { handle, isLocalRequest } from "@/lib/server/http";
import { tick } from "@/lib/server/tick";

export const maxDuration = 60;

export async function GET(req: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET?.trim();
    const allowed = secret ? req.headers.get("authorization") === `Bearer ${secret}` : isLocalRequest(req);
    if (!allowed) return Response.json({ error: "Unauthorized." }, { status: 401 });
    const r = await tick(getDb());
    return Response.json({ ...r, ran: r.ran.filter((x) => x.executions || x.skipped?.startsWith("failed")) });
  });
}
