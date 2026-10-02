/** POST /api/auth/nonce { wallet } → { message } to sign (and a short-lived cookie). */
import { cookieHeader, NONCE_COOKIE, startSignIn } from "@/lib/server/auth";
import { clientIp, handle, rateLimit, readJson } from "@/lib/server/http";

export async function POST(req: Request) {
  return handle(async () => {
    rateLimit(`nonce:${clientIp(req)}`, 20);
    const { wallet } = (await readJson(req, 2048)) as { wallet?: string };
    const { message, cookie } = startSignIn(String(wallet ?? ""), new URL(req.url).host);
    return Response.json({ message }, { headers: { "set-cookie": cookieHeader(NONCE_COOKIE, cookie, 600) } });
  });
}
