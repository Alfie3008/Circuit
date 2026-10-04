/** GET /api/chain/balance?wallet=[&mint=] → { sol } or { tokens } (live read). */
import { isAddress } from "@/lib/chain/parse";
import { chainRoute } from "@/lib/chain/route";
import { ChainError, getSolBalance, getTokenBalance } from "@/lib/chain/rpc";

export async function GET(req: Request) {
  return chainRoute(req, async (p) => {
    const wallet = p.get("wallet") ?? "";
    if (!isAddress(wallet)) throw new ChainError("That isn't a Solana wallet address.", 400);
    const mint = p.get("mint");
    if (mint !== null) {
      if (!isAddress(mint)) throw new ChainError("That isn't a Solana token address.", 400);
      return { tokens: await getTokenBalance(wallet, mint) };
    }
    return { sol: await getSolBalance(wallet) };
  });
}
