/**
 * Runtime AI for blocks.
 *   GET  /api/ai          → whether real AI is available (no secrets)
 *   POST /api/ai { op… }  → result of one AI operation (CIRCUIT_RUNTIME_MODEL)
 * The client falls back to mock answers whenever this is unavailable.
 */
import { guard, passwordRequired } from "@/lib/ai/guard";
import { AiError, aiConfigured, anthropicCaller, compileModel, runtimeModel } from "@/lib/ai/model";
import { runOp, RuntimeOpSchema } from "@/lib/ai/runtime";

export async function GET() {
  return Response.json({
    enabled: aiConfigured(),
    compileModel: compileModel(),
    runtimeModel: runtimeModel(),
    passwordRequired: passwordRequired(),
  });
}

export async function POST(req: Request) {
  const call = anthropicCaller();
  if (!call) return Response.json({ error: "AI is not configured on this server." }, { status: 503 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const op = RuntimeOpSchema.safeParse(body);
  if (!op.success) return Response.json({ error: "Invalid AI request." }, { status: 400 });

  const blocked = guard(req, "runtime");
  if (blocked) return blocked;
  try {
    const model = runtimeModel();
    return Response.json({ result: await runOp(op.data, call, model), model });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("Unexpected AI error.", 500);
    return Response.json({ error: err.message }, { status: err.status });
  }
}
