/**
 * The spend meter for AI calls made outside running coins (Build with AI, and
 * AI blocks in the builder): every call's real cost is recorded in the
 * database, and nothing runs once the server's daily limit is reached.
 * (Running coins are metered by the runner, which also checks their AI fuel.)
 */
import { getDb } from "@/lib/server/db";
import { today } from "@/lib/server/runner";
import { AiError, anthropicCaller, type ModelCaller } from "./model";
import { aiDailyCapUsd } from "./spend";

/** Usage rows for spend that isn't any coin's. */
export const BUCKETS = { compile: "__compile", builder: "__builder" } as const;

/** Today's AI spend across the whole server, and the limit. */
export async function spendToday(now = Date.now()) {
  const { usd, calls } = await getDb().aiUsage(null, today(now));
  return { usd, calls, capUsd: aiDailyCapUsd() };
}

const capMessage = (cap: number) => `Circuit's AI spending limit for today ($${cap.toFixed(2)}) is used up. It resets at midnight UTC.`;

/** A metered caller for one bucket, or null when no API key is set. */
export function meteredCaller(bucket: string): ModelCaller | null {
  const db = getDb();
  const base = anthropicCaller({
    onCost: async (usd) => {
      try {
        await db.addAiUsage(bucket, today(), 1, usd);
      } catch (e) {
        console.error("[circuit] couldn't record AI spend", bucket, usd, e);
      }
    },
  });
  if (!base) return null;
  return async (req) => {
    const { usd, capUsd } = await spendToday();
    if (usd >= capUsd) throw new AiError(capMessage(capUsd), 429);
    return base(req);
  };
}
