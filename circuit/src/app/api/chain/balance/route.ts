/** GET /api/chain/balance?wallet= → { sol } (live read). */
import { isAddress } from "@/lib/chain/parse";
import { chainRoute } from "@/lib/chain/route";
import { ChainError, getSolBalance } from "@/lib/chain/rpc";

export async function GET(req: Request) {
  return chainRoute(req, async (p) => {
    const wallet = p.get("wallet") ?? "";
    if (!isAddress(wallet)) throw new ChainError("That isn't a Solana wallet address.", 400);
    return { sol: await getSolBalance(wallet) };
  });
}
