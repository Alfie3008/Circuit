/** GET /api/p/:slug/proof?receipt=ID → a receipt and its place in an anchored batch (public). */
import { intParam } from "@/lib/chain/route";
import { getDb } from "@/lib/server/db";
import { clientIp, handle, rateLimit } from "@/lib/server/http";
import { receiptProof } from "@/lib/server/proofs";

export async function GET(req: Request, ctx: RouteContext<"/api/p/[slug]/proof">) {
  return handle(async () => {
    rateLimit(`proof:${clientIp(req)}`, 60);
    const { slug } = await ctx.params;
    const db = getDb();
    const project = await db.getProjectBySlug(slug.toLowerCase());
    if (!project) return Response.json({ error: "No such project." }, { status: 404 });
    const id = intParam(new URL(req.url).searchParams, "receipt", 0, 0, 2 ** 31 - 1);
    const [receipt] = await db.listReceipts(project.id, 1, id + 1);
    if (!receipt || receipt.id !== id) return Response.json({ error: "No such receipt." }, { status: 404 });
    return Response.json({ receipt, anchor: await receiptProof(db, project, id), rules: project.proof?.rules ?? [] });
  });
}
