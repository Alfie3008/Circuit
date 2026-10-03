import { describe, expect, it } from "vitest";
import { getTemplate } from "@/lib/templates";
import { canonicalRules } from "./fingerprint";

describe("rules fingerprint text", () => {
  it("ignores layout and key order, but not behaviour", () => {
    const p = structuredClone(getTemplate("living-crew")!.program);
    const base = canonicalRules(p);
    const moved = structuredClone(p);
    moved.scripts[0].position = { x: 999, y: 5 };
    expect(canonicalRules(moved)).toBe(base);
    const changed = structuredClone(p);
    (changed.scripts[0].event as unknown as { amount: number }).amount = 20;
    expect(canonicalRules(changed)).not.toBe(base);
  });
});
