/**
 * GET    /api/projects/:id                  → owner's view (settings, status)
 * PATCH  /api/projects/:id { live?, reset?, layout? }
 * DELETE /api/projects/:id                  → unpublish (the page goes away)
 */
import { getDb } from "@/lib/server/db";
import { handle, rateLimit, readJson, requireWallet } from "@/lib/server/http";
import { ownProject, unpublish, updateSettings } from "@/lib/server/projects";
import { fuelOf } from "@/lib/fuel";
import { runLimits, today } from "@/lib/server/runner";

export async function GET(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  return handle(async () => {
    const owner = requireWallet(req);
    const { id } = await ctx.params;
    const db = getDb();
    // Not published yet is a normal answer here, not an error.
    if (!(await db.getProject(id))) return Response.json({ project: null });
    const p = await ownProject(db, owner, id);
    const [row, usage, totals] = await Promise.all([db.getState(id), db.aiUsage(id, today()), db.fuelTotals(id)]);
    return Response.json({
      project: { id: p.id, slug: p.slug, name: p.name, live: p.live, timezone: p.timezone, updatedAt: p.updatedAt, program: p.program, setup: p.setup, proof: p.proof ?? {} },
      status: { ...(row?.meta ?? {}), executions: row?.state.executionCount ?? 0 },
      aiToday: usage,
      fuel: fuelOf(totals),
      limits: runLimits(),
    });
  });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  return handle(async () => {
    const owner = requireWallet(req);
    rateLimit(`settings:${owner}`, 30);
    const { id } = await ctx.params;
    const { project, webhook } = await updateSettings(getDb(), owner, id, await readJson(req, 4096));
    return Response.json({ project: { id: project.id, slug: project.slug, live: project.live }, webhook });
  });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  return handle(async () => {
    const owner = requireWallet(req);
    const { id } = await ctx.params;
    await unpublish(getDb(), owner, id);
    return Response.json({ ok: true });
  });
}
