/** GET /api/web/get?url=&headers= → an HTTP GET as programs see it ({ status, ok, body }), for the builder. */
import { chainRoute } from "@/lib/chain/route";
import { ChainError } from "@/lib/chain/rpc";
import { FetchBlocked, safeFetch } from "@/lib/server/safeFetch";
import { bodyOf, webEnabled } from "@/lib/server/web";

export async function GET(req: Request) {
  return chainRoute(req, async (p) => {
    if (!webEnabled()) throw new ChainError("Web access is switched off on this server.", 503);
    let headers: Record<string, string> = {};
    try {
      headers = JSON.parse(p.get("headers") || "{}") as Record<string, string>;
    } catch {
      throw new ChainError("Those headers aren't readable.", 400);
    }
    try {
      const r = await safeFetch(p.get("url") ?? "", { headers });
      return { status: r.status, ok: r.status < 400, body: bodyOf(r) };
    } catch (e) {
      throw new ChainError(e instanceof FetchBlocked ? e.message : `Couldn't reach that address (${e instanceof Error ? e.message : String(e)}).`, e instanceof FetchBlocked ? 400 : 502);
    }
  });
}
