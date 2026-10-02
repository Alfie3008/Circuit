/**
 * POST /api/compile  { prompt }  →  { program, explanation, source }
 *
 * With ANTHROPIC_API_KEY: Claude (CIRCUIT_COMPILE_MODEL) writes Circuit IR,
 * validated and repaired. Without a key: the hand-written example that
 * matches the prompt, if any (offline demo).
 */
import { compileWithModel, MAX_PROMPT_CHARS } from "@/lib/ai/compile";
import { matchExample } from "@/lib/ai/examples";
import { guard } from "@/lib/ai/guard";
import { AiError, anthropicCaller, compileModel } from "@/lib/ai/model";

export async function POST(req: Request) {
  let prompt: unknown;
  try {
    ({ prompt } = (await req.json()) as { prompt?: unknown });
  } catch {
    return Response.json({ error: "Expected JSON: { prompt }" }, { status: 400 });
  }
  if (typeof prompt !== "string" || !prompt.trim()) return Response.json({ error: "Describe what you want the program to do." }, { status: 400 });
  if (prompt.length > MAX_PROMPT_CHARS) return Response.json({ error: `Keep the description under ${MAX_PROMPT_CHARS} characters.` }, { status: 400 });

  const call = anthropicCaller();
  if (!call) {
    const example = matchExample(prompt);
    if (example) return Response.json({ program: example.program, explanation: example.explanation, source: "offline" });
    return Response.json(
      { error: "Build with AI needs an Anthropic API key (ANTHROPIC_API_KEY in .env.local). Without one, the example prompts still work.", offline: true },
      { status: 503 },
    );
  }

  const blocked = guard(req, "compile");
  if (blocked) return blocked;
  try {
    const model = compileModel();
    const result = await compileWithModel(prompt, call, model);
    return Response.json({ program: result.program, explanation: result.explanation, source: "claude", model, attempts: result.attempts });
  } catch (e) {
    const err = e instanceof AiError ? e : new AiError("Unexpected error while compiling.", 500);
    return Response.json({ error: err.message }, { status: err.status });
  }
}
