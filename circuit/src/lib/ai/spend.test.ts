import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryDb } from "@/lib/server/memoryDb";
import { setDb } from "@/lib/server/db";
import { today } from "@/lib/server/runner";
import { BUCKETS, meteredCaller, spendToday } from "./meter";
import { aiDailyCapUsd, costOf } from "./spend";

afterEach(() => {
  vi.unstubAllEnvs();
  setDb(undefined);
});

describe("AI spend", () => {
  it("prices calls from reported token usage, cache included", () => {
    // Sonnet 5.5: $2 in, $10 out per million.
    expect(costOf("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 100_000 })).toBeCloseTo(3);
    // Dated Haiku id matches its family: $1 in; cache write 1.25x, read 0.1x.
    expect(costOf("claude-haiku-4-5-20251001", { input_tokens: 0, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 })).toBeCloseTo(1.35);
    // Unknown models are priced at the top rate, never under-counted.
    expect(costOf("claude-something-new", { output_tokens: 1_000_000 })).toBeCloseTo(50);
    expect(costOf("claude-sonnet-5-5", {})).toBe(0);
  });

  it("refuses every call once the server's daily limit is spent, before anything is sent", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("CIRCUIT_AI_DAILY_USD", "0.5");
    const db = memoryDb();
    setDb(db);
    expect(aiDailyCapUsd()).toBe(0.5);
    await db.addAiUsage(BUCKETS.compile, today(), 3, 0.3);
    await db.addAiUsage("some-coin", today(), 9, 0.2);
    expect(await spendToday()).toMatchObject({ usd: 0.5, calls: 12, capUsd: 0.5 });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const call = meteredCaller(BUCKETS.builder)!;
    await expect(call({ model: "claude-haiku-4-5", system: "x", messages: [{ role: "user", content: "hi" }], maxTokens: 5 })).rejects.toMatchObject({ status: 429 });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
