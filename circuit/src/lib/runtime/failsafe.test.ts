/**
 * Failsafes: no program a person (or the AI) can put together may crash
 * Circuit. Hundreds of random programs, built from every block in the library
 * with odd values, wrong types and deep nesting, go through every stage:
 * validate, explain, convert to blocks, fingerprint, and run against every
 * kind of event, with adapters that work, that throw, and that return junk.
 * Nothing may throw; every run must end with a receipt.
 */
import { describe, expect, it } from "vitest";
import { BLOCKS, type BlockSpec } from "@/lib/blocks";
import type { Check } from "@/lib/blocks/types";
import { explainProgram } from "@/lib/explain/explain";
import { describeIssues, parseProgram, programToBlockly, type Expr, type IRNode } from "@/lib/ir";
import { canonicalRules } from "@/lib/ir/fingerprint";
import { irKey, itemsOf, LITERAL_BLOCKS } from "@/lib/ir/schema";
import { compatible } from "@/lib/ir/validate";
import { mockAdapters, type Adapters } from "./adapters";
import { begin, finish, trigger } from "./engine";
import { simulateFor, type CircuitEvent, type EventKind } from "./events";
import { runToEnd } from "./interpreter";
import { Rng } from "./rng";
import { initialState, LIMITS, trimWorld } from "./state";
import { sizeOf } from "./values";

const literal = new Set<string>(Object.values(LITERAL_BLOCKS));
const HATS = BLOCKS.filter((b) => b.shape === "hat");
const STMTS = BLOCKS.filter((b) => b.shape === "statement" || b.shape === "terminal");
const EXPRS = BLOCKS.filter((b) => (b.shape === "reporter" || b.shape === "boolean") && !literal.has(b.type));

const TEXTS = ["", "x", "{x}", "{event.amount}", "{nope}", "a, b, c", "k=v, n=2", "-1", "1e999", "💥🦝", "  ", "x".repeat(5000), "javascript:alert(1)"];
const NUMBERS = [0, 1, -1, 2.5, 1e9, -1e9, 1e300, 0.0000001];
const VARS = ["x", "y", "agent", "list", "count"];

/** A value for an input: usually one that fits its type (so programs get past validation and run), sometimes anything. */
function value(rng: Rng, depth: number, check: Check = null): Expr {
  const fits = (out: Check) => rng.next() < 0.03 || compatible(check, out);
  const r = rng.next();
  if (depth > 0 && r < 0.45) {
    const options = EXPRS.filter((e) => fits(e.shape === "boolean" ? ["Boolean"] : (e.output ?? null)));
    if (options.length) return node(rng.pick(options)!, rng, depth - 1);
  }
  const literals: [Check, () => Expr][] = [
    [["Number"], () => rng.pick(NUMBERS)!],
    [["String"], () => rng.pick(TEXTS)!],
    [["Boolean"], () => rng.next() < 0.5],
    [["List"], () => ["a", 1, "b"]],
  ];
  const ok = literals.filter(([out]) => fits(out));
  return ok.length ? rng.pick(ok)![1]() : (null as unknown as Expr);
}

function node(spec: BlockSpec, rng: Rng, depth: number): IRNode {
  const out: IRNode = { type: spec.ir };
  for (const item of itemsOf(spec)) {
    const key = irKey(item.name);
    if (rng.next() < 0.08) continue; // sometimes leave things out
    switch (item.kind) {
      case "text":
        out[key] = rng.pick(TEXTS)!;
        break;
      case "number": {
        const n = rng.pick(NUMBERS)!;
        out[key] = rng.next() < 0.03 ? n : Math.min(item.max ?? Infinity, Math.max(item.min ?? -Infinity, n));
        break;
      }
      case "dropdown":
        out[key] = rng.pick(item.options)![1];
        break;
      case "checkbox":
        out[key] = rng.next() < 0.5;
        break;
      case "variable":
        out[key] = rng.pick(VARS)!;
        break;
      case "statement":
        out[key] = depth > 0 ? stmts(rng, depth - 1, 3) : [];
        break;
      case "value":
        out[key] = rng.next() < 0.1 ? null : value(rng, depth, item.check);
        break;
    }
  }
  return out;
}

const stmts = (rng: Rng, depth: number, max: number): IRNode[] => Array.from({ length: rng.int(0, max) }, () => node(rng.pick(STMTS)!, rng, depth));

function randomProgram(rng: Rng): unknown {
  return {
    version: 1,
    scripts: Array.from({ length: rng.int(1, 4) }, () => ({ event: node(rng.pick(HATS)!, rng, 1), body: stmts(rng, 3, 6) })),
  };
}

const KINDS: EventKind[] = [
  "trade",
  "creator_fees",
  "market_cap",
  "holders",
  "wallet_receives",
  "token_graduates",
  "tick",
  "time",
  "webhook",
  "website_event",
  "agent_completes",
  "bounty_submission",
  "button",
];
const JUNK = [null, "", "abc", -5, 1e12, ["x"], { a: 1 }];

function event(rng: Rng, kind: EventKind, t: number): CircuitEvent {
  const data: CircuitEvent["data"] = { amount: rng.pick([1, 10, -3, 0, ...JUNK])!, side: rng.pick(["buy", "sell", "?"])!, wallet: rng.pick(["w", "", null])! };
  for (const k of ["minutes", "time", "path", "name", "payload", "agent", "result", "submission", "bounty", "marketCap", "holders", "token"]) if (rng.next() < 0.5) data[k] = rng.pick(JUNK)!;
  return { type: kind, source: rng.pick(["simulator", "live", "schedule", "runtime"] as const)!, timestamp: t, data };
}

const boom = () => {
  throw new Error("service down");
};
/** Adapters whose every call fails, or answers with nonsense. */
function hostile(base: Adapters, mode: "throw" | "junk"): Adapters {
  const wrap = <T extends object>(o: T): T =>
    new Proxy(o, {
      get(target, prop) {
        const v = Reflect.get(target, prop);
        if (typeof v !== "function") return v;
        return mode === "throw" ? async () => boom() : async () => (Math.random() < 0.5 ? undefined : null);
      },
    });
  return { ai: wrap(base.ai), web: wrap(base.web), chain: wrap(base.chain) };
}

describe("failsafes: random programs never crash Circuit", () => {
  it("validate, explain, convert, fingerprint and run 1,000 random programs", async () => {
    const statuses = new Set(["complete", "error", "stopped", "step_limit"]);
    let ran = 0;
    let valid = 0;
    const errors: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const rng = new Rng(1000 + i);
      const raw = randomProgram(rng);
      const parsed = parseProgram(raw);
      if (!parsed.ok) {
        const described = describeIssues(raw, parsed.issues);
        expect(described.length).toBeGreaterThan(0);
        for (const d of described) expect(d.text).not.toMatch(/undefined|\[object/);
        continue;
      }
      valid++;
      const program = parsed.program;
      explainProgram(program);
      programToBlockly(program);
      canonicalRules(program);

      const state = initialState(i);
      const base = mockAdapters(rng);
      const adapters = i % 3 === 0 ? base : hostile(base, i % 3 === 1 ? "throw" : "junk");
      // Each script's own event (twice, so state carries over), then junk events of every kind.
      const events = [
        ...program.scripts.flatMap((sc) => [simulateFor(sc.event, state, rng, 1_000), simulateFor(sc.event, state, rng, 1_001)]),
        ...Array.from({ length: 6 }, () => event(rng, rng.pick(KINDS)!, 1_002)),
      ];
      for (let e = 0; e < events.length; e++) {
        const queue = [events[e]];
        let chain = 0;
        while (queue.length && chain < 25) {
          for (const match of trigger(state, program, queue.shift()!, rng)) {
            if (++chain > 25) break;
            const { receipt, run } = begin(state, match, { rng, adapters, now: () => 1_000 + e, raise: (ev) => queue.push(ev) });
            let r = await run.next();
            while (!r.done) r = await run.next();
            finish(state, receipt, r.value, 1_000 + e);
            ran++;
            expect(statuses.has(r.value.status), r.value.error ?? "").toBe(true);
            expect(receipt.entries.length).toBeLessThanOrEqual(LIMITS.receiptEntries + 1);
            if (r.value.status === "error") expect(r.value.error).toBeTruthy();
            errors.push(`${r.value.error ?? ""} ${receipt.entries.at(-1)?.details.join(" ") ?? ""}`);
          }
        }
      }
      expect(() => JSON.stringify(state)).not.toThrow();
    }
    // Raw JavaScript errors are caught and reported plainly, but each one is a bug: there should be none.
    expect(errors.filter((e) => /Something went wrong/.test(e))).toEqual([]);
    expect(valid).toBeGreaterThan(300);
    expect(ran).toBeGreaterThan(1000);
  }, 60_000);

  it("rejects garbage input with readable reasons instead of throwing", () => {
    const deep: Record<string, unknown> = { type: "set_var", var: "x", value: 1 };
    let cur = deep;
    for (let i = 0; i < 5000; i++) {
      const next = { type: "arithmetic", op: "add", a: 1, b: 1 };
      cur.value = next;
      cur = next;
    }
    for (const input of [null, 42, "program", [], { version: 2 }, { version: 1, scripts: "nope" }, { version: 1, scripts: [{ event: { type: "nope" }, body: [] }] }, { version: 1, scripts: [{ event: { type: "button" }, body: [deep] }] }]) {
      const r = parseProgram(input);
      expect(r.ok).toBe(false);
      if (!r.ok) for (const d of describeIssues(input, r.issues)) expect(d.text.length).toBeGreaterThan(0);
    }
  });

  it("a value that doubles every step stops at the limit, not at the machine's", async () => {
    const parsed = parseProgram({
      version: 1,
      variables: ["x"],
      scripts: [
        {
          event: { type: "button" },
          body: [
            { type: "set_var", var: "x", value: "abcdefgh" },
            { type: "repeat", times: 60, do: [{ type: "set_var", var: "x", value: { type: "join", a: { type: "var", var: "x" }, b: { type: "var", var: "x" } } }] },
          ],
        },
      ],
    });
    expect(parsed.ok, parsed.ok ? "" : JSON.stringify(parsed.issues)).toBe(true);
    if (!parsed.ok) return;
    const state = initialState(1);
    const rng = new Rng(1);
    const receipt = { id: 1, startedAt: 0, finishedAt: null, event: { type: "button", label: "", source: "simulator", data: {} }, status: "running" as const, error: null, steps: 0, entries: [] };
    const r = await runToEnd(parsed.program.scripts[0], { state, rng, adapters: mockAdapters(rng), receipt, payload: {} });
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/too big/);
    expect(sizeOf(state.variables, Infinity)).toBeLessThan(LIMITS.valueChars * 2);
  });

  it("logs that grow on every run keep only their newest entries", () => {
    const state = initialState(1);
    state.collections.things = Array.from({ length: LIMITS.collectionItems + 50 }, (_, i) => i);
    state.feed = Array.from({ length: 500 }, (_, i) => ({ at: i, kind: "post" as const, text: String(i), run: 1 }));
    trimWorld(state);
    expect(state.collections.things).toHaveLength(LIMITS.collectionItems);
    expect(state.collections.things[0]).toBe(50);
    expect(state.feed.length).toBeLessThanOrEqual(200);
  });
});
