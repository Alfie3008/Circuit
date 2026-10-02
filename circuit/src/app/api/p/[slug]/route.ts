/** GET /api/p/:slug[?receipts=N] → a published project's public view (polled by its page). */
import { intParam } from "@/lib/chain/route";
import { getDb } from "@/lib/server/db";
import { clientIp, handle, rateLimit } from "@/lib/server/http";
import { publicProject } from "@/lib/server/publicView";

export async function GET(req: Request, ctx: RouteContext<"/api/p/[slug]">) {
  return handle(async () => {
    rateLimit(`public:${clientIp(req)}`, 240);
    const { slug } = await ctx.params;
    const view = await publicProject(getDb(), slug.toLowerCase(), intParam(new URL(req.url).searchParams, "receipts", 20, 1, 100));
    if (!view) return Response.json({ error: "No such project." }, { status: 404 });
    // Shared caches (Vercel's edge) may serve this for a few seconds.
    return Response.json(view, { headers: { "cache-control": "public, s-maxage=5, stale-while-revalidate=10" } });
  });
}
