/**
 * Server-only access to Claude. Everything above this file talks to a
 * `ModelCaller`, so compile/runtime logic is testable with a fake caller and
 * the app runs (on offline fallbacks) when no API key is configured.
 */
import Anthropic from "@anthropic-ai/sdk";
import { costOf } from "./spend";

/** Natural language → Circuit IR. */
export const compileModel = () => process.env.CIRCUIT_COMPILE_MODEL?.trim() || "claude-sonnet-5-5";
/** AI blocks while a program runs (many small calls). */
export const runtimeModel = () => process.env.CIRCUIT_RUNTIME_MODEL?.trim() || "claude-haiku-4-5";

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY?.trim();

export interface ModelRequest {
  model: string;
  /** Stable instructions; cached between calls. */
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  maxTokens: number;
}

/** Returns the model's text reply, or throws AiError. */
export type ModelCaller = (req: ModelRequest) => Promise<string>;

export class AiError extends Error {
  constructor(
    message: string,
    /** HTTP status to report to the client. */
    public status: number,
  ) {
    super(message);
  }
}

// Models that accept the server-side refusal fallback ("default" routing).
const FALLBACK_MODELS = /^claude-(sonnet-5-5|opus-5-5|opus-5|fable-5-1)$/;

/** Maps SDK errors to messages a creator can act on. Most specific first. */
function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AiError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.local.", 502);
  if (e instanceof Anthropic.PermissionDeniedError) return new AiError("This API key isn't allowed to use that model.", 502);
  if (e instanceof Anthropic.NotFoundError) return new AiError("Model not found. Check CIRCUIT_COMPILE_MODEL / CIRCUIT_RUNTIME_MODEL.", 502);
  if (e instanceof Anthropic.RateLimitError) return new AiError("Anthropic rate limit reached. Try again in a minute.", 429);
  // e.g. "Your credit balance is too low" arrives as a 400.
  if (e instanceof Anthropic.BadRequestError) return new AiError(`Anthropic rejected the request: ${e.message}`, 502);
  if (e instanceof Anthropic.APIConnectionError) return new AiError("Couldn't reach Anthropic. Check the network.", 502);
  if (e instanceof Anthropic.APIError) return new AiError(`Anthropic error ${e.status ?? ""}: ${e.message}`, 502);
  return new AiError(e instanceof Error ? e.message : "Unknown AI error", 500);
}

/**
 * A caller backed by the Anthropic API, or null when no key is configured.
 * `onCost` gets each call's real cost (USD, from the reported token usage),
 * including calls that end in a refusal or are cut off, which are billed too.
 */
export function anthropicCaller(opts: { onCost?: (usd: number, model: string) => void | Promise<void> } = {}): ModelCaller | null {
  if (!aiConfigured()) return null;
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY; retries 429/5xx twice
  return async (req) => {
    try {
      const response = await client.beta.messages.create({
        model: req.model,
        max_tokens: req.maxTokens,
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: req.messages,
        // On a policy decline, re-run on a fallback model inside the same call.
        ...(FALLBACK_MODELS.test(req.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      // Priced at the model that answered (a fallback may have served it).
      await opts.onCost?.(costOf(response.model ?? req.model, response.usage), response.model ?? req.model);
      if (response.stop_reason === "refusal") throw new AiError("The model declined this request.", 422);
      if (response.stop_reason === "max_tokens") throw new AiError("The model's answer was cut off. Try a shorter request.", 502);
      return response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    } catch (e) {
      throw toAiError(e);
    }
  };
}

/** Pulls the first JSON object out of a reply (tolerates ```json fences and stray prose). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new SyntaxError("No JSON object in the reply");
  return JSON.parse(body.slice(start, end + 1));
}
