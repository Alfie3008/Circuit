/**
 * POST /api/webhooks/helius: Helius "raw" webhook deliveries. Each transaction
 * is matched to the live projects watching its accounts, parsed into events,
 * claimed (so redeliveries and polling never run it twice) and run.
 */
import { timingSafeEqual } from "node:crypto";
import { pool } from "@/lib/chain/rpc";
import type { CircuitEvent } from "@/lib/runtime/events";
import { intake, liveByAddress, projectEvents, webhookTransactions } from "@/lib/server/chainFeed";
import { getDb } from "@/lib/server/db";
import { involvedAddresses } from "@/lib/chain/parse";
import { handle, readJson } from "@/lib/server/http";
import { runProject } from "@/lib/server/runner";

export const maxDuration = 60;

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function POST(req: Request) {
  return handle(async () => {
    const expected = process.env.HELIUS_WEBHOOK_AUTH?.trim();
    if (!expected) return Response.json({ error: "Webhooks are not configured." }, { status: 503 });
    if (!same(req.headers.get("authorization") ?? "", expected)) return Response.json({ error: "Unauthorized." }, { status: 401 });

    const db = getDb();
    const txs = webhookTransactions(await readJson(req, 4 * 1024 * 1024)).slice(0, 200);
    const live = await liveByAddress(db);

    // Group events per project, oldest first.
    const perProject = new Map<string, CircuitEvent[]>();
    const byId = new Map([...live.values()].flat().map((p) => [p.id, p]));
    for (const tx of txs) {
      const projects = new Set([...involvedAddresses(tx)].flatMap((a) => live.get(a) ?? []));
      for (const p of projects) {
        const events = await projectEvents(tx, p);
        if (events.length) perProject.set(p.id, [...(perProject.get(p.id) ?? []), ...events]);
      }
    }

    const results = await pool([...perProject], 4, async ([id, events]) => {
      try {
        return await runProject(db, id, await intake(db, byId.get(id)!, events));
      } catch (e) {
        console.error("[circuit] webhook run failed", id, e);
        return { projectId: id, failed: true };
      }
    });
    // Always 200 once accepted: a failed project shouldn't make Helius resend everyone's events.
    return Response.json({ transactions: txs.length, projects: results });
  });
}
