/** GET /api/server/status → how this server is set up (no secrets). */
import { chainProvider } from "@/lib/chain/rpc";
import { aiConfigured } from "@/lib/ai/model";
import { getDb } from "@/lib/server/db";
import { publicUrl, webhooksConfigured } from "@/lib/server/helius";
import { handle } from "@/lib/server/http";
import { runLimits } from "@/lib/server/runner";

export async function GET() {
  return handle(async () =>
    Response.json({
      database: getDb().kind,
      ai: aiConfigured(),
      chain: chainProvider(),
      events: webhooksConfigured() ? "webhooks" : chainProvider() ? "polling" : "timers only",
      cron: process.env.VERCEL ? "vercel" : "local (npm run cron)",
      publicUrl: publicUrl(),
      limits: runLimits(),
    }),
  );
}
