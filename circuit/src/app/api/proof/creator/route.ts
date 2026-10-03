/** GET /api/proof/creator?mint= → who created the coin, and whether it's the signed-in wallet. */
import { coinCreator } from "@/lib/chain/creator";
import { isAddress } from "@/lib/chain/parse";
import { chainProvider } from "@/lib/chain/rpc";
import { handle, rateLimit, requireWallet } from "@/lib/server/http";
import { ServerError } from "@/lib/server/types";

export async function GET(req: Request) {
  return handle(async () => {
    const wallet = requireWallet(req);
    rateLimit(`creator:${wallet}`, 20);
    const mint = new URL(req.url).searchParams.get("mint") ?? "";
    if (!isAddress(mint)) throw new ServerError("That isn't a Solana token address.");
    if (!chainProvider()) return Response.json({ creator: null, source: null, checked: false, matches: null });
    try {
      const { creator, source } = await coinCreator(mint);
      return Response.json({ creator, source, checked: true, matches: creator ? creator === wallet : null });
    } catch (e) {
      throw new ServerError(`Couldn't check who created this coin right now (${e instanceof Error ? e.message : String(e)}).`, 503);
    }
  });
}
