/** GET /api/chain/holders?mint= → { holders, capped } (Helius DAS). */
import { chainRoute } from "@/lib/chain/route";
import { holderCount } from "@/lib/chain/rpc";

export async function GET(req: Request) {
  return chainRoute(req, (p) => holderCount(p.get("mint") ?? ""));
}
