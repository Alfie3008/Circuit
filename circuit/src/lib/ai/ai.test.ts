import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IR_VARIANTS, LITERAL_BLOCKS } from "@/lib/ir";
import { mockAdapters, mockAi } from "@/lib/runtime/adapters";
import { begin, finish, trigger } from "@/lib/runtime/engine";
import { simulateFor } from "@/lib/runtime/events";
import { Rng } from "@/lib/runtime/rng";
import { initialState } from "@/lib/runtime/state";
import { remoteAi } from "@/lib/runtime/remoteAi";
import { blockCatalog, compileSystemPrompt, compileWithModel } from "./compile";
import { EXAMPLES, matchExample } from "./examples";
import { guard, resetGuard } from "./guard";
import { AiError, anthropicCaller, type ModelCaller, type ModelRequest } from "./model";
import { runOp } from "./runtime";

const valid = { version: 1, scripts: [{ event: { type: "button", label: "Go" }, body: [{ type: "update_feed", message: "hi" }] }] };

/** A fake model: returns the queued replies in order and records requests. */
function fake(...replies: string[]) {
  const requests: ModelRequest[] = [];
  const call: ModelCaller = async (req) => {
    requests.push(structuredClone(req));
    const next = replies.shift();
    if (next === undefined) throw new Error("no more replies");
    return next;
  };
  return { call, requests };
}

describe("compiler", () => {
  it("catalog lists every block type the IR accepts", () => {
    const catalog = blockCatalog();
    const literal = new Set<string>(Object.keys(LITERAL_BLOCKS));
    for (const ir of IR_VARIANTS.keys()) if (!literal.has(ir)) expect(catalog, ir).toContain(`- ${ir} {`);
    // Stays a reasonable prompt size (roughly 4 chars per token).
    expect(compileSystemPrompt().length / 4).toBeLessThan(12000);
  });

  it("accepts a fenced JSON reply on the first try", async () => {
    const { call, requests } = fake("```json\n" + JSON.stringify({ explanation: "Says hi.", program: valid }) + "\n```");
    const out = await compileWithModel("say hi", call, "m");
    expect(out.attempts).toBe(1);
    expect(out.explanation).toBe("Says hi.");
    expect(out.program.scripts[0].event.type).toBe("button");
    expect(requests[0].model).toBe("m");
  });

  it("feeds validation errors back and accepts the repair", async () => {
    const bad = { program: { version: 1, scripts: [{ event: { type: "button" }, body: [{ type: "spawn_rat" }] }] } };
    const { call, requests } = fake(JSON.stringify(bad), JSON.stringify({ explanation: "ok", program: valid }));
    const out = await compileWithModel("make a rat", call, "m");
    expect(out.attempts).toBe(2);
    const retry = requests[1].messages;
    expect(retry.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(String(retry[2].content)).toMatch(/didn't validate/);
  });

  it("gives up with a clear error after the repair budget", async () => {
    const { call, requests } = fake("nope", "still nope", "never");
    await expect(compileWithModel("x", call, "m")).rejects.toMatchObject({ status: 502 });
    expect(requests).toHaveLength(3);
  });

  it("offline examples all validate, match their prompts, and run", async () => {
    for (const ex of EXAMPLES) {
      expect(matchExample(ex.prompt)).toBe(ex);
      const state = initialState(1);
      const rng = new Rng(3);
      if (ex.program.scripts[0].event.type === "bounty_submission")
        state.bounties.push({ id: "bounty_1", title: "Memes", description: "", reward: 0.1, deadline: 0, status: "open", submissions: [], createdAt: 0 });
      state.agents.push({ ...(await mockSeedAgent()) });
      for (const match of trigger(state, ex.program, simulateFor(ex.program.scripts[0].event, state, rng, 1), rng)) {
        const { receipt, run } = begin(state, match, { rng, adapters: mockAdapters(rng), now: () => 1 });
        let r = await run.next();
        while (!r.done) r = await run.next();
        finish(state, receipt, r.value, 1);
        expect(r.value.error, ex.prompt).toBeNull();
      }
    }
    expect(matchExample("make me a sandwich")).toBeUndefined();
  });
});

async function mockSeedAgent() {
  return {
    id: "agent_0", name: "Nori", identity: "", species: "otter", personality: "calm",
    visual: { mode: "placeholder" as const, value: "" }, goal: "", model: "default", memoryEnabled: true,
    memory: [], inventory: [], budget: 0, score: 0, tools: [], custom: {}, inWorld: false, createdAt: 0, history: [],
  };
}

describe("runtime ops", () => {
  const run = (op: Parameters<typeof runOp>[0], reply: string) => runOp(op, fake(reply).call, "m");

  it("parses and bounds model replies", async () => {
    expect(await run({ op: "ask", prompt: "hi" }, ' "Hello there" ')).toBe("Hello there");
    expect(await run({ op: "choose", options: ["a", "b", "c"], criteria: "" }, '{"choice": 2, "reason": "b is best"}')).toEqual({ index: 1, reason: "b is best" });
    expect(await run({ op: "choose", options: ["a", "b"], criteria: "" }, '{"choice": 9}')).toMatchObject({ index: 0 });
    expect(await run({ op: "classify", text: "t", labels: ["Happy", "Sad"] }, "sad.")).toBe("Sad");
    expect(await run({ op: "decide", question: "?" }, "Yes.")).toBe(true);
    expect(await run({ op: "review", content: "c", criteria: "" }, '{"score": 140, "feedback": "wow"}')).toEqual({ score: 100, feedback: "wow" });
    expect(await run({ op: "structured", prompt: "p", fields: ["name", "score"] }, '{"name": "Pip", "score": 7, "extra": 1}')).toEqual({ name: "Pip", score: 7 });
    expect(await run({ op: "identity", subject: "owl" }, '{"name":"Hoot","personality":"wise","bio":"An owl."}')).toEqual({ name: "Hoot", personality: "wise", bio: "An owl." });
    await expect(run({ op: "identity", subject: "owl" }, "no json here")).rejects.toBeInstanceOf(AiError);
  });

  it("the browser adapter falls back to the mock when the route fails", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "Anthropic rejected the request: credit balance too low" }, { status: 502 }));
    const reasons: string[] = [];
    const ai = remoteAi(mockAi(new Rng(1)), "claude-haiku-4-5", (r) => reasons.push(r));
    const answer = await ai.ask("hello");
    expect(typeof answer).toBe("string");
    expect(ai.label).toMatch(/^mock \(fell back: .*credit balance/);
    expect(reasons).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("the browser adapter uses the route's answer when it works", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ result: "real answer", model: "claude-haiku-4-5" }));
    const ai = remoteAi(mockAi(new Rng(1)), "claude-haiku-4-5");
    expect(await ai.ask("hello")).toBe("real answer");
    expect(ai.label).toBe("claude-haiku-4-5");
    vi.unstubAllGlobals();
  });
});

describe("guard", () => {
  const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { method: "POST", headers });
  beforeEach(() => resetGuard());
  afterEach(() => vi.unstubAllEnvs());

  it("without a password, only serves localhost", () => {
    vi.stubEnv("CIRCUIT_AI_PASSWORD", "");
    expect(guard(req("http://localhost:3000/api/compile"), "compile")).toBeNull();
    expect(guard(req("https://circuit.example.com/api/compile"), "compile")?.status).toBe(403);
  });

  it("with a password, requires it", async () => {
    vi.stubEnv("CIRCUIT_AI_PASSWORD", "s3cret");
    const denied = guard(req("https://circuit.example.com/api/ai"), "runtime");
    expect(denied?.status).toBe(401);
    expect(await denied!.json()).toMatchObject({ needsPassword: true });
    expect(guard(req("https://circuit.example.com/api/ai", { "x-circuit-password": "s3cret" }), "runtime")).toBeNull();
  });

  it("rate limits per client per minute", () => {
    vi.stubEnv("CIRCUIT_AI_RATE_LIMIT", "3");
    const r = () => req("http://localhost:3000/api/compile", { "x-forwarded-for": "1.2.3.4" });
    for (let i = 0; i < 3; i++) expect(guard(r(), "compile", 1000)).toBeNull();
    const limited = guard(r(), "compile", 1000);
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("retry-after")).toBe("60");
    expect(guard(r(), "compile", 62_000)).toBeNull(); // window passed
    expect(guard(req("http://localhost:3000/api/compile", { "x-forwarded-for": "5.6.7.8" }), "compile", 1000)).toBeNull();
  });
});

describe("Anthropic SDK wiring (network stubbed)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is off without a key", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(anthropicCaller()).toBeNull();
  });

  it("sends the expected request and returns the reply text", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    let sent: { url: string; headers: Headers; body: Record<string, unknown> } | undefined;
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      sent = { url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
      return Response.json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [{ type: "text", text: "Hello" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 2 },
      });
    });
    const call = anthropicCaller()!;
    const text = await call({ model: "claude-sonnet-5-5", system: "sys", messages: [{ role: "user", content: "hi" }], maxTokens: 100 });
    expect(text).toBe("Hello");
    expect(sent!.url).toMatch(/\/v1\/messages/);
    expect(sent!.headers.get("x-api-key")).toBe("sk-ant-test");
    expect(sent!.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(sent!.body).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 100,
      fallbacks: "default",
      system: [{ type: "text", text: "sys", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "hi" }],
    });
  });

  it("does not send fallbacks for Haiku", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ id: "m", type: "message", role: "assistant", model: "claude-haiku-4-5", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
    });
    await anthropicCaller()!({ model: "claude-haiku-4-5", system: "s", messages: [{ role: "user", content: "x" }], maxTokens: 50 });
    expect(body.fallbacks).toBeUndefined();
  });

  it("explains an unfunded key and a bad key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    const fail = (status: number, message: string) =>
      vi.stubGlobal("fetch", async () => Response.json({ type: "error", error: { type: "invalid_request_error", message } }, { status }));
    fail(400, "Your credit balance is too low to access the Anthropic API.");
    await expect(anthropicCaller()!({ model: "claude-haiku-4-5", system: "s", messages: [{ role: "user", content: "x" }], maxTokens: 5 })).rejects.toMatchObject({
      status: 502,
      message: expect.stringMatching(/credit balance is too low/),
    });
    fail(401, "invalid x-api-key");
    await expect(anthropicCaller()!({ model: "claude-haiku-4-5", system: "s", messages: [{ role: "user", content: "x" }], maxTokens: 5 })).rejects.toMatchObject({
      message: expect.stringMatching(/API key was rejected/),
    });
  });
});
