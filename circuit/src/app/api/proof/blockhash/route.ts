/** GET /api/proof/blockhash → a recent blockhash, for the owner's wallet to sign the rules memo. */
import { chainProvider, getLatestBlockhash } from "@/lib/chain/rpc";
import { handle, rateLimit, requireWallet } from "@/lib/server/http";
import { ServerError } from "@/lib/server/types";

export async function GET(req: Request) {
  return handle(async () => {
    const wallet = requireWallet(req);
    rateLimit(`blockhash:${wallet}`, 20);
    if (!chainProvider()) throw new ServerError("This server has no Solana connection.", 503);
    return Response.json(await getLatestBlockhash());
  });
}
