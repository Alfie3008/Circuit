/**
 * AI adapter backed by the server's /api/ai route (real Claude). Each call
 * that fails (no credit, rate limit, offline) falls back to the mock for that
 * call, and the receipt label says so, so a run never breaks because AI did.
 */
import { aiPost, errorText } from "@/lib/ai/client";
import type { RuntimeOp } from "@/lib/ai/runtime";
import type { AiAdapter } from "./adapters";

export function remoteAi(mock: AiAdapter, model: string, onFallback?: (reason: string) => void): AiAdapter {
  let label = model;

  async function call<T>(op: RuntimeOp, fallback: () => Promise<T>): Promise<T> {
    try {
      const res = await aiPost("/api/ai", op);
      if (!res.ok) throw new Error(await errorText(res));
      const body = (await res.json()) as { result: T };
      label = model;
      return body.result;
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      label = `mock (fell back: ${reason})`;
      onFallback?.(reason);
      return fallback();
    }
  }

  return {
    get label() {
      return label;
    },
    ask: (prompt) => call({ op: "ask", prompt }, () => mock.ask(prompt)),
    structured: (prompt, fields) => call({ op: "structured", prompt, fields }, () => mock.structured(prompt, fields)),
    choose: (options, criteria, display) =>
      call({ op: "choose", options: options.map(display), criteria }, () => mock.choose(options, criteria, display)),
    classify: (text, labels) => call({ op: "classify", text, labels }, () => mock.classify(text, labels)),
    summarize: (text) => call({ op: "summarize", text }, () => mock.summarize(text)),
    identity: (subject) => call({ op: "identity", subject }, () => mock.identity(subject)),
    decide: (question) => call({ op: "decide", question }, () => mock.decide(question)),
    generateText: (kind, topic) => call({ op: "generateText", kind, topic }, () => mock.generateText(kind, topic)),
    review: (content, criteria) => call({ op: "review", content, criteria }, () => mock.review(content, criteria)),
    runAgent: (agent, task, tools, context) =>
      call(
        {
          op: "runAgent",
          agent: {
            name: agent.name,
            species: agent.species,
            personality: agent.personality,
            identity: agent.identity,
            goal: agent.goal,
            memory: agent.memory.slice(-20),
          },
          task,
          tools,
          context,
        },
        () => mock.runAgent(agent, task, tools, context),
      ),
  };
}
