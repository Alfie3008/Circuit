/**
 * One cron tick (about once a minute): for every live project, fire due
 * timers and poll the chain if it's time, then run what came in.
 */
import { chainProvider, pool } from "@/lib/chain/rpc";
import type { CircuitEvent } from "@/lib/runtime/events";
import { claimNew, pollProject, watchedAddresses } from "./chainFeed";
import { webhooksConfigured } from "./helius";
import { runProject, type RunOptions, type RunSummary } from "./runner";
import { timerEvents } from "./schedule";
import { emptyMeta, type Db, type RunMeta } from "./types";

/** Stop starting new projects after this long (the function's limit is 60 s). */
const TICK_BUDGET_MS = 45_000;
const CONCURRENCY = 4;

export interface TickResult {
  projects: number;
  ran: RunSummary[];
  /** Live projects not reached this tick (out of time). */
  deferred: number;
  ms: number;
}

export async function tick(db: Db, opts: RunOptions & { poll?: boolean } = {}): Promise<TickResult> {
  const clock = opts.now ?? Date.now;
  const started = clock();
  // With webhooks, polling is only a safety net for missed deliveries.
  const pollEveryMs = (webhooksConfigured() ? 10 : 1) * 60_000 - 5_000;
  const canPoll = opts.poll ?? !!chainProvider();
  const projects = await db.listProjects({ live: true, limit: 10_000 });
  let deferred = 0;

  const results = await pool(projects, CONCURRENCY, async (p): Promise<RunSummary | null> => {
    if (clock() - started > TICK_BUDGET_MS) {
      deferred++;
      return null;
    }
    let chain: CircuitEvent[] = [];
    let cursor: RunMeta["cursor"] | null = null;
    let pollError: string | null = null;
    if (canPoll && watchedAddresses(p).length) {
      const meta = { ...emptyMeta(), ...((await db.getState(p.id))?.meta ?? {}) };
      if (!meta.lastPollAt || started - meta.lastPollAt >= pollEveryMs) {
        try {
          const r = await pollProject(p, meta);
          chain = await claimNew(db, p.id, r.events);
          cursor = r.cursor;
        } catch (e) {
          pollError = e instanceof Error ? e.message : String(e);
        }
      }
    }
    try {
      return await runProject(
        db,
        p.id,
        (ctx) => {
          if (cursor) {
            ctx.meta.cursor = cursor;
            ctx.meta.lastPollAt = started;
          }
          if (pollError) ctx.meta.lastError = `Reading the chain failed: ${pollError}`;
          return [...timerEvents(ctx.project.program, ctx.meta, ctx.now, ctx.project.timezone), ...chain];
        },
        opts,
      );
    } catch (e) {
      // One broken project must not stop the others.
      return { projectId: p.id, events: 0, executions: 0, errors: 1, dropped: 0, aiCalls: 0, skipped: `failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  });

  return { projects: projects.length, ran: results.filter((r): r is RunSummary => !!r), deferred, ms: clock() - started };
}
