import { describe, expect, it } from "vitest";
import { BLOCKS } from "@/lib/blocks";
import { EXAMPLES } from "@/lib/ai/examples";
import { IR_VARIANTS, LITERAL_BLOCKS, parseProgram, type IRNode } from "@/lib/ir";
import { getTemplate, TEMPLATES } from "@/lib/templates";
import { explainProgram, toText } from "./explain";

describe("plain-English view", () => {
  it("reads Living Crew as sentences", () => {
    const [script] = explainProgram(getTemplate("living-crew")!.program);
    expect(toText(script.title)).toBe("Every 10 SOL of volume:");
    expect(script.lines.map((l) => toText(l.parts))).toEqual([
      "Create an agent: a random cat, frog, penguin, raccoon, dog or capybara with an AI-generated name and personality, saved as agent.",
      "Set selectedAsset to a random pick from NVDA, TSLA, AAPL, META or AMD.",
      "Buy 0.03 SOL of selectedAsset (simulated).",
      "Set the holdings of agent to selectedAsset.",
      "Show agent in the project world.",
      "Post “{agent} joined the crew and bought {selectedAsset}” to the feed.",
    ]);
  });

  it("nests IF/ELSE and links every sentence to its block", () => {
    const [, review] = explainProgram(getTemplate("creator-engine")!.program);
    const text = review.lines.map((l) => `${"  ".repeat(l.depth)}${toText(l.parts)}`);
    expect(text).toContain("If score is at least 80:");
    expect(text).toContain("Otherwise:");
    expect(review.lines.find((l) => l.depth === 1)).toBeTruthy();
  });

  it("phrases every block in the library without crashing or leaving gaps", () => {
    const literal = new Set<string>(Object.values(LITERAL_BLOCKS));
    for (const spec of BLOCKS) {
      if (spec.shape === "hat" || literal.has(spec.type)) continue;
      const stmt = spec.shape === "statement" || spec.shape === "terminal";
      const node: IRNode = { type: spec.ir };
      const body = stmt ? [node] : [{ type: "set_var", var: "x", value: node }];
      const parsed = parseProgram({ version: 1, scripts: [{ event: { type: "button" }, body }] });
      if (!parsed.ok) continue; // a few blocks need specific inputs; covered by templates/examples
      const out = explainProgram(parsed.program)[0].lines.map((l) => toText(l.parts));
      expect(out.length, spec.type).toBeGreaterThan(0);
      for (const s of out) expect(s, spec.type).not.toMatch(/undefined|\[object/);
    }
    expect(IR_VARIANTS.size).toBeGreaterThan(90);
  });

  it("covers every template and example", () => {
    for (const p of [...TEMPLATES.map((t) => t.program), ...EXAMPLES.map((e) => e.program)])
      for (const s of explainProgram(p)) for (const l of s.lines) expect(toText(l.parts)).not.toMatch(/undefined|\[object|null/);
  });
});
