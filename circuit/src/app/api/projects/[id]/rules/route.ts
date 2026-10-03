/** POST /api/projects/:id/rules { signature } → records a rules version written to Solana by the owner. */
import { getDb } from "@/lib/server/db";
import { handle, rateLimit, readJson, requireWallet } from "@/lib/server/http";
import { recordRules } from "@/lib/server/proofs";
import { ServerError } from "@/lib/server/types";

export const maxDuration = 30;

export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/rules">) {
  return handle(async () => {
    const owner = requireWallet(req);
    rateLimit(`rules:${owner}`, 20);
    const { id } = await ctx.params;
    const body = (await readJson(req, 2048)) as { signature?: unknown };
    if (typeof body?.signature !== "string") throw new ServerError("Send the transaction signature.");
    return Response.json({ version: await recordRules(getDb(), owner, id, body.signature) });
  });
}
