/** POST /api/auth/verify { wallet, signature (base64) } → signed in (session cookie). */
import { cookieHeader, finishSignIn, NONCE_COOKIE, readCookie, SESSION_COOKIE, SESSION_DAYS } from "@/lib/server/auth";
import { clientIp, handle, rateLimit, readJson } from "@/lib/server/http";

export async function POST(req: Request) {
  return handle(async () => {
    rateLimit(`verify:${clientIp(req)}`, 20);
    const { wallet, signature } = (await readJson(req, 4096)) as { wallet?: string; signature?: string };
    const session = finishSignIn(readCookie(req, NONCE_COOKIE), String(wallet ?? ""), String(signature ?? ""), new URL(req.url).host);
    const headers = new Headers();
    headers.append("set-cookie", cookieHeader(SESSION_COOKIE, session, SESSION_DAYS * 86_400));
    headers.append("set-cookie", cookieHeader(NONCE_COOKIE, "", 0));
    return Response.json({ wallet }, { headers });
  });
}
