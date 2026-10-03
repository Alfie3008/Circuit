/**
 * GET  /api/projects            → the signed-in wallet's published projects
 * POST /api/projects { id, name, slug, program, setup, timezone } → publish / republish
 */
import { getDb } from "@/lib/server/db";
import { handle, rateLimit, readJson, requireWallet } from "@/lib/server/http";
import { publish } from "@/lib/server/projects";

export async function GET(req: Request) {
  return handle(async () => {
    const owner = requireWallet(req);
    const projects = await getDb().listProjects({ owner, limit: 100 });
    return Response.json({ projects: projects.map(({ id, slug, name, live, updatedAt }) => ({ id, slug, name, live, updatedAt })) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const owner = requireWallet(req);
    rateLimit(`publish:${owner}`, 20);
    const project = await publish(getDb(), owner, await readJson(req));
    return Response.json({ project: { id: project.id, slug: project.slug, live: project.live } });
  });
}
