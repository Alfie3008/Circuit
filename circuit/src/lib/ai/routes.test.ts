import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as aiStatus, POST as aiPost } from "@/app/api/ai/route";
import { POST as compile } from "@/app/api/compile/route";
import { EXAMPLE_PROMPTS } from "./examples";

const post = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("AI routes without an API key", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("status says AI is off", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await (await aiStatus()).json()).toMatchObject({ enabled: false, compileModel: "claude-sonnet-5-5", runtimeModel: "claude-haiku-4-5" });
  });

  it("compile serves the offline example, and explains otherwise", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const ok = await compile(post("http://localhost:3000/api/compile", { prompt: EXAMPLE_PROMPTS[0] }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ source: "offline", program: { version: 1 } });
    const no = await compile(post("http://localhost:3000/api/compile", { prompt: "a spaceship race" }));
    expect(no.status).toBe(503);
    expect((await no.json()).error).toMatch(/ANTHROPIC_API_KEY/);
    expect((await compile(post("http://localhost:3000/api/compile", { prompt: "" }))).status).toBe(400);
  });

  it("runtime AI is unavailable (the client then uses mock answers)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await aiPost(post("http://localhost:3000/api/ai", { op: "ask", prompt: "hi" }))).status).toBe(503);
  });

  it("rejects malformed runtime requests before calling the model", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    expect((await aiPost(post("http://localhost:3000/api/ai", { op: "hack" }))).status).toBe(400);
    expect((await aiPost(post("http://localhost:3000/api/ai", { op: "ask", prompt: "x".repeat(5000) }))).status).toBe(400);
  });
});
