/** GET /api/web/open?url= → a page as programs see it (title, text, links), for the builder. */
import { chainRoute } from "@/lib/chain/route";
import { ChainError } from "@/lib/chain/rpc";
import { FetchBlocked, safeFetch } from "@/lib/server/safeFetch";
import { pageOf, webEnabled } from "@/lib/server/web";

export async function GET(req: Request) {
  return chainRoute(req, async (p) => {
    if (!webEnabled()) throw new ChainError("Web access is switched off on this server.", 503);
    try {
      const r = await safeFetch(p.get("url") ?? "");
      if (r.status >= 400) throw new ChainError(`The site answered ${r.status}.`, 502);
      return pageOf(r);
    } catch (e) {
      if (e instanceof ChainError) throw e;
      throw new ChainError(e instanceof FetchBlocked ? e.message : `Couldn't open that page (${e instanceof Error ? e.message : String(e)}).`, e instanceof FetchBlocked ? 400 : 502);
    }
  });
}
