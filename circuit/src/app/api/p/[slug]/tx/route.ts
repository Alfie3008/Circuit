/**
 * GET /api/p/:slug/tx?receipt=ID | ?version=N → the memo and signer of the
 * Solana transaction that proves a receipt's batch or a rules version. A
 * fallback for Verify when the public Solana RPC doesn't answer the browser.
 */
import { memosOf, signerOf } from "@/lib/chain/parse";
import { intParam } from "@/lib/chain/route";
import { chainProvider, getTransaction } from "@/lib/chain/rpc";
import { getDb } from "@/lib/server/db";
import { clientIp, handle, rateLimit } from "@/lib/server/http";

export async function GET(req: Request, ctx: RouteContext<"/api/p/[slug]/tx">) {
  return handle(async () => {
    rateLimit(`tx:${clientIp(req)}`, 30);
    const { slug } = await ctx.params;
    const params = new URL(req.url).searchParams;
    const db = getDb();
    const project = await db.getProjectBySlug(slug.toLowerCase());
    if (!project) return Response.json({ error: "No such project." }, { status: 404 });

    let sig: string | null = null;
    if (params.has("version")) {
      const n = intParam(params, "version", 0, 0, 1_000_000);
      sig = project.proof?.rules?.find((v) => v.version === n)?.signature ?? null;
    } else {
      const id = intParam(params, "receipt", 0, 0, 2 ** 31 - 1);
      const anchor = (await db.receiptAnchors(project.id, [id]))[id];
      sig = anchor ? ((await db.getBatch(anchor.batchId))?.signature ?? null) : null;
    }
    if (!sig) return Response.json({ error: "That isn't on Solana yet." }, { status: 404 });
    if (!chainProvider()) return Response.json({ error: "This server has no Solana connection." }, { status: 503 });
    const tx = await getTransaction(sig).catch(() => null);
    if (!tx) return Response.json({ error: "Solana doesn't have that transaction yet." }, { status: 404 });
    return Response.json({ signature: sig, slot: tx.slot, failed: !!tx.meta?.err, signer: signerOf(tx), memos: memosOf(tx) });
  });
}
