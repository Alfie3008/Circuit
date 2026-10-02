/** POST /api/auth/logout → signed out. */
import { cookieHeader, SESSION_COOKIE } from "@/lib/server/auth";

export async function POST() {
  return Response.json({ wallet: null }, { headers: { "set-cookie": cookieHeader(SESSION_COOKIE, "", 0) } });
}
