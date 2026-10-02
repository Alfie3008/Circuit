/** GET /api/chain/history?mint=&hours=24&max=300 → past events (oldest first), for backtests. */
import { chainRoute, intParam } from "@/lib/chain/route";
import { history } from "@/lib/chain/rpc";

export async function GET(req: Request) {
  return chainRoute(req, (p) => history({ mint: p.get("mint") ?? "", hours: intParam(p, "hours", 24, 1, 168), max: intParam(p, "max", 300, 10, 1000) }));
}
