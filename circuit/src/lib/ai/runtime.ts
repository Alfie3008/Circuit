/**
 * Runtime AI: what ASK AI, AI CHOOSE, RUN AGENT … do when a real model is
 * configured. One op per adapter method; inputs are validated and size-capped
 * (they come from the browser), outputs are parsed and checked so a sloppy
 * reply can't break the interpreter.
 */
import { z } from "zod";
import { AiError, extractJson, type ModelCaller } from "./model";

const text = (max = 2000) => z.string().max(max);
const list = z.array(text(200)).max(50);

export const RuntimeOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("ask"), prompt: text() }),
  z.object({ op: z.literal("structured"), prompt: text(), fields: list }),
  z.object({ op: z.literal("choose"), options: list.min(1), criteria: text(500) }),
  z.object({ op: z.literal("classify"), text: text(), labels: list.min(1) }),
  z.object({ op: z.literal("summarize"), text: text(8000) }),
  z.object({ op: z.literal("identity"), subject: text(200) }),
  z.object({ op: z.literal("decide"), question: text() }),
  z.object({ op: z.literal("generateText"), kind: text(40), topic: text(500) }),
  z.object({ op: z.literal("review"), content: text(4000), criteria: text(500) }),
  z.object({
    op: z.literal("runAgent"),
    agent: z.object({
      name: text(100),
      species: text(100),
      personality: text(300),
      identity: text(1000),
      goal: text(500),
      memory: z.array(text(500)).max(20),
    }),
    task: text(),
    tools: z.array(text(40)).max(10),
    context: text(),
  }),
]);
export type RuntimeOp = z.infer<typeof RuntimeOpSchema>;

const SYSTEM = `You are the AI inside a CIRCUIT program: a playful, programmable crypto project. A creator's blocks call you while the program runs, and your answer is used directly as a value (shown in a feed, stored in a variable, or used in a decision).

- Answer the request directly. No preamble, no follow-up questions, no markdown.
- Keep it short: one or two sentences unless the request asks for more.
- When asked for JSON, reply with only the JSON object.
- Stay in character when speaking as an agent.
- Never present anything as financial advice; trades in CIRCUIT are simulated.`;

const MAX_TOKENS = 1024;

/** Runs one op with `call`; returns the JSON-safe result the client adapter expects. */
export async function runOp(op: RuntimeOp, call: ModelCaller, model: string): Promise<unknown> {
  const ask = (content: string) => call({ model, system: SYSTEM, messages: [{ role: "user", content }], maxTokens: MAX_TOKENS });
  const askJson = async (content: string) => {
    const reply = await ask(`${content}\n\nReply with only the JSON object.`);
    try {
      return extractJson(reply) as Record<string, unknown>;
    } catch {
      throw new AiError("The AI's answer wasn't valid JSON.", 502);
    }
  };
  const clean = (s: string) => s.trim().replace(/^"|"$/g, "");

  switch (op.op) {
    case "ask":
      return clean(await ask(op.prompt));

    case "structured": {
      const fields = op.fields.length ? op.fields : ["answer"];
      const out = await askJson(`${op.prompt}\n\nReturn a JSON object with exactly these keys: ${fields.join(", ")}. Values are short strings, numbers or booleans.`);
      const result: Record<string, string | number | boolean> = {};
      for (const f of fields) {
        const v = out[f];
        result[f] = typeof v === "number" || typeof v === "boolean" ? v : v == null ? "" : String(v);
      }
      return result;
    }

    case "choose": {
      const numbered = op.options.map((o, i) => `${i + 1}. ${o}`).join("\n");
      const out = await askJson(`Choose one option${op.criteria ? ` by this criterion: ${op.criteria}` : ""}.\n${numbered}\n\nReturn {"choice": <option number>, "reason": "<short reason>"}.`);
      const n = Number(out.choice);
      const index = Number.isInteger(n) && n >= 1 && n <= op.options.length ? n - 1 : 0;
      return { index, reason: String(out.reason ?? "") };
    }

    case "classify": {
      const reply = clean(await ask(`Classify this text as exactly one of: ${op.labels.join(", ")}.\nText: ${op.text}\n\nReply with the label only.`)).toLowerCase();
      return op.labels.find((l) => l.toLowerCase() === reply) ?? op.labels.find((l) => reply.includes(l.toLowerCase())) ?? op.labels[0];
    }

    case "summarize":
      return clean(await ask(`Summarize in one sentence:\n${op.text}`));

    case "identity": {
      const out = await askJson(`Invent a fun, original character${op.subject ? ` who is a ${op.subject}` : ""}. Return {"name": "<first name>", "personality": "<a few words>", "bio": "<one sentence>"}.`);
      return { name: String(out.name ?? "Nameless").slice(0, 60), personality: String(out.personality ?? ""), bio: String(out.bio ?? "") };
    }

    case "decide": {
      const reply = clean(await ask(`${op.question}\n\nAnswer with only yes or no.`)).toLowerCase();
      return reply.startsWith("y");
    }

    case "generateText":
      return clean(await ask(`Write a short ${op.kind.replace(/_/g, " ")}${op.topic ? ` about ${op.topic}` : ""}.`));

    case "review": {
      const out = await askJson(`Review this submission${op.criteria ? ` for ${op.criteria}` : ""}:\n${op.content}\n\nReturn {"score": <0-100>, "feedback": "<one sentence>"}.`);
      const score = Math.max(0, Math.min(100, Math.round(Number(out.score) || 0)));
      return { score, feedback: String(out.feedback ?? "") };
    }

    case "runAgent": {
      const a = op.agent;
      const memory = a.memory.length ? `\nYou remember: ${a.memory.slice(-5).join("; ")}` : "";
      const tools = op.tools.length ? `\nYou may use (simulated): ${op.tools.join(", ")}.` : "";
      return clean(
        await ask(
          `You are ${a.name}, a ${a.species}. Personality: ${a.personality || "unspecified"}.${a.identity ? ` ${a.identity}` : ""}${a.goal ? ` Your goal: ${a.goal}.` : ""}${memory}${tools}\n\nTask: ${op.task || "Pursue your goal."}${op.context ? `\nContext: ${op.context}` : ""}\n\nSay in one or two sentences, in character, what you did.`,
        ),
      );
    }
  }
}
