import { describe, expect, it } from "vitest";
import { formatIssues, parseProgram } from "@/lib/ir";
import { getTemplate } from "@/lib/templates";
import { backtest, simulatedHistory } from "./backtest";

describe("backtest", () => {
  it("replays a simulated day through Living Crew", async () => {
    const events = simulatedHistory(24, 42, 1_790_000_000_000);
    const r = await backtest(getTemplate("living-crew")!.program, events);
    expect(r.trades).toBeGreaterThan(100);
    // One agent per 10 SOL of volume.
    expect(r.agentsCreated).toBe(Math.floor(r.volumeSol / 10));
    expect(r.executions).toBe(r.agentsCreated);
    expect(r.aiCalls).toBe(r.agentsCreated); // one identity call per agent
    expect(r.errors).toBe(0);
    expect(r.timeline.filter((p) => p.ran.length).length).toBe(r.executions);
    expect(r.estCreatorFeesSol).toBeCloseTo(r.volumeSol * 0.003, 3);
    expect(r.note).toBeNull();
  });

  it("is deterministic and never touches real state", async () => {
    const events = simulatedHistory(6, 1, 1_790_000_000_000);
    const p = getTemplate("living-crew")!.program;
    const a = await backtest(p, events);
    const b = await backtest(p, events);
    expect(a.agentsCreated).toBe(b.agentsCreated);
    expect(a.receipts.map((x) => x.entries.map((e) => e.text))).toEqual(b.receipts.map((x) => x.entries.map((e) => e.text)));
  });

  it("explains when nothing would have run", async () => {
    const parsed = parseProgram({ version: 1, scripts: [{ event: { type: "token_graduates" }, body: [] }] });
    if (!parsed.ok) throw new Error(formatIssues(parsed.issues));
    const r = await backtest(parsed.program, simulatedHistory(2, 3, 1_790_000_000_000));
    expect(r.executions).toBe(0);
    expect(r.note).toMatch(/token graduates/);
  });

  it("follows raised events (Creator Engine: bounty, submission, review)", async () => {
    const r = await backtest(getTemplate("creator-engine")!.program, simulatedHistory(24, 42, 1_790_000_000_000));
    expect(r.executions).toBeGreaterThanOrEqual(2);
    expect(r.aiCalls).toBeGreaterThanOrEqual(1); // AI review
  });
});
