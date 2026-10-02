/** GET /api/chain/status → whether live Solana reads are configured (no secrets). */
import { chainProvider } from "@/lib/chain/rpc";

export async function GET() {
  const provider = chainProvider();
  return Response.json({ enabled: provider !== null, provider, holders: provider === "helius" });
}
