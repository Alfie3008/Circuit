/** GET /api/auth/me → { wallet } (null when signed out). */
import { requestWallet } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";

export async function GET(req: Request) {
  return handle(async () => Response.json({ wallet: requestWallet(req) }));
}
