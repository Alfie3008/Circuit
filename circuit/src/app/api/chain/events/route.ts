/**
 * GET /api/chain/events?mint=&wallet=&until=&walletUntil=
 * New live events (oldest first) and cursors for the next poll.
 */
import { chainRoute } from "@/lib/chain/route";
import { pollEvents } from "@/lib/chain/rpc";

export async function GET(req: Request) {
  return chainRoute(req, (p) =>
    pollEvents({
      mint: p.get("mint") ?? "",
      wallet: p.get("wallet") || undefined,
      until: p.get("until") || undefined,
      walletUntil: p.get("walletUntil") || undefined,
    }),
  );
}
