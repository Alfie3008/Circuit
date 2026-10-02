/**
 * Plain-English view of a program, generated from the IR (no AI, so it is
 * free, instant and always matches the blocks).
 *
 * Common blocks have hand-written phrasing; every other block is phrased from
 * its own definition (its labels and fields), so new blocks and modules are
 * covered automatically.
 */
import { irKey, resolveSpec, type Expr, type IRNode, type Program } from "@/lib/ir";
import { describeHat } from "@/lib/runtime/events";

/** A piece of a sentence: plain words, or a value to show as a pill. */
export type Part = { text: string } | { value: string; kind: "value" | "var" | "list" | "event" };

export interface Line {
  /** Block this sentence describes (for highlighting). */
  id?: string;
  depth: number;
  parts: Part[];
}

export interface ScriptExplanation {
  hatId?: string;
  title: Part[];
  lines: Line[];
}

const t = (text: string): Part => ({ text });
const v = (value: string, kind: "value" | "var" | "list" | "event" = "value"): Part => ({ value, kind });

/** "a, b or c" */
const orList = (items: (string | number)[]) =>
  items.length <= 1 ? String(items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;

const words = (s: string) => s.replace(/_/g, " ");

function dropdownLabel(node: IRNode, key: string): string {
  const spec = resolveSpec(node);
  for (const row of spec?.rows ?? [])
    for (const item of row.items)
      if (item.kind === "dropdown" && irKey(item.name) === key) {
        const opt = item.options.find((o) => o[1] === node[key]);
        if (opt) return opt[0];
      }
  return words(String(node[key] ?? ""));
}

const COMPARE: Record<string, string> = { eq: "is", neq: "is not", gt: "is more than", lt: "is less than", gte: "is at least", lte: "is at most" };
const ARITH: Record<string, string> = { add: "plus", sub: "minus", mul: "times", div: "divided by" };

/** Phrase for a value (literal or reporter). */
export function phrase(e: Expr | null | undefined): Part[] {
  if (e === null || e === undefined) return [v("nothing")];
  if (typeof e === "number") return [v(String(e))];
  if (typeof e === "boolean") return [v(e ? "true" : "false")];
  if (typeof e === "string") return [v(`“${e}”`)];
  if (Array.isArray(e)) return [v(e.join(", "), "list")];
  const n = e;
  switch (n.type) {
    case "var":
      return [v(String(n.var), "var")];
    case "event_field":
      return [t("the event's"), v(words(String(n.field)), "event")];
    case "random_item":
      return Array.isArray(n.list) ? [t("a random pick from"), v(orList(n.list as (string | number)[]), "list")] : [t("a random item from"), ...phrase(n.list as Expr)];
    case "random_number":
      return [t("a random number from"), ...phrase(n.min as Expr), t("to"), ...phrase(n.max as Expr)];
    case "compare":
      return [...phrase(n.a as Expr), t(COMPARE[String(n.op)] ?? "compares to"), ...phrase(n.b as Expr)];
    case "logic_op":
      return [...phrase(n.a as Expr), t(String(n.op)), ...phrase(n.b as Expr)];
    case "not":
      return [t("not"), ...phrase(n.value as Expr)];
    case "exists":
      return [...phrase(n.value as Expr), t("exists")];
    case "chance":
      return [t("a"), v(`${n.percent}%`), t("chance")];
    case "arithmetic":
      return [...phrase(n.a as Expr), t(ARITH[String(n.op)] ?? String(n.op)), ...phrase(n.b as Expr)];
    case "join":
      return [...phrase(n.a as Expr), t("followed by"), ...phrase(n.b as Expr)];
    case "ai_ask":
      return [t("the AI's answer to"), ...phrase(n.prompt as Expr)];
    case "budget_check":
      return [t("budget"), v(String(n.name), "var"), t("has at least"), ...phrase(n.amount as Expr), t("SOL")];
    case "budget":
      return [t("budget"), v(String(n.name), "var")];
    case "treasury":
      return [t("the treasury's"), v(String(n.asset))];
    case "agent_get":
      return [t("the"), v(String(n.prop)), t("of"), ...phrase(n.agent as Expr)];
    case "get_key":
      return [t("the"), v(String(n.key)), t("of"), ...phrase(n.object as Expr)];
    case "object":
      return [v(Object.entries((n.pairs as Record<string, unknown>) ?? {}).map(([k, x]) => `${k}=${x}`).join(", ") || "an empty object")];
    default:
      return generic(n);
  }
}

/** Phrase any block from its definition: labels as words, fields and inputs as values. */
function generic(n: IRNode): Part[] {
  const spec = resolveSpec(n);
  if (!spec) return [t(words(n.type))];
  const out: Part[] = [];
  for (const row of spec.rows)
    for (const item of row.items) {
      if (item.kind === "label") out.push(t(item.text));
      else if (item.kind === "statement") continue;
      else if (item.kind === "value") out.push(...phrase(n[irKey(item.name)] as Expr));
      else if (item.kind === "dropdown") out.push(v(dropdownLabel(n, irKey(item.name))));
      else if (item.kind === "variable") out.push(v(String(n[irKey(item.name)]), "var"));
      else if (item.kind === "checkbox") {
        if (n[irKey(item.name)]) out.push(t("✓"));
      } else {
        const raw = n[irKey(item.name)];
        if (raw !== "" && raw !== undefined) out.push(Array.isArray(raw) ? v(raw.join(", "), "list") : v(String(raw)));
      }
    }
  return out;
}

const cap = (parts: Part[]): Part[] => {
  const [first, ...rest] = parts;
  if (first && "text" in first) return [t(first.text.charAt(0).toUpperCase() + first.text.slice(1)), ...rest];
  return parts;
};

function speciesPhrase(n: IRNode): Part[] {
  const raw = n.species;
  const list = Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (n.speciesMode === "random_from_list") return [t("a random"), v(orList(list), "list")];
  if (n.speciesMode === "free_text") return [t("a"), v(list.join(", ") || "creature")];
  return [t("an AI-invented creature")];
}

/** Sentences for a list of statements, nested by depth. */
function lines(list: IRNode[] | undefined, depth: number): Line[] {
  const out: Line[] = [];
  for (const n of list ?? []) {
    const line = (parts: Part[]) => out.push({ id: n.id, depth, parts: cap(parts) });
    const nest = (key: string) => out.push(...lines(n[key] as IRNode[] | undefined, depth + 1));
    if (n.disabled) {
      line([t("(disabled)"), ...generic(n)]);
      continue;
    }
    switch (n.type) {
      case "if":
        line([t("if"), ...phrase(n.condition as Expr), t(":")]);
        nest("then");
        if (Array.isArray(n.else) && n.else.length) {
          out.push({ id: n.id, depth, parts: [t("Otherwise:")] });
          nest("else");
        }
        break;
      case "repeat":
        line([t("repeat"), ...phrase(n.times as Expr), t("times:")]);
        nest("do");
        break;
      case "for_each":
        line([t("for each"), v(String(n.var), "var"), t("in"), ...phrase(n.list as Expr), t(":")]);
        nest("do");
        break;
      case "random_chance":
        line([t("with a"), ...phrase(n.percent as Expr), t("% chance:")]);
        nest("then");
        if (Array.isArray(n.else) && n.else.length) {
          out.push({ id: n.id, depth, parts: [t("Otherwise:")] });
          nest("else");
        }
        break;
      case "set_var":
        line([t("set"), v(String(n.var), "var"), t("to"), ...phrase(n.value as Expr), t(".")]);
        break;
      case "change_var":
        line([t("change"), v(String(n.var), "var"), t("by"), ...phrase(n.by as Expr), t(".")]);
        break;
      case "increment_var":
        line([t("add 1 to"), v(String(n.var), "var"), t(".")]);
        break;
      case "create_agent": {
        const name = n.nameMode === "manual" ? [t("named"), v(`“${n.name}”`)] : [t("with an AI-generated name")];
        const personality = n.personalityMode === "ai_generated" ? [t("and personality")] : [];
        line([t("create an agent:"), ...speciesPhrase(n), ...name, ...personality, t(", saved as"), v(String(n.var), "var"), t(".")]);
        break;
      }
      case "run_agent":
        line([t("have"), ...phrase(n.agent as Expr), t("work on"), ...phrase(n.task as Expr), t(", saving the result as"), v(String(n.resultVar), "var"), t(".")]);
        break;
      case "sim_buy":
        line([t("buy"), ...phrase(n.amount as Expr), v(String(n.unit)), t("of"), ...phrase(n.asset as Expr), t("(simulated).")]);
        break;
      case "sim_sell":
        line([t("sell"), ...phrase(n.amount as Expr), v(String(n.unit)), t("of"), ...phrase(n.asset as Expr), t("(simulated).")]);
        break;
      case "sim_transfer":
        line([t("send"), ...phrase(n.amount as Expr), v(String(n.unit)), t("to"), ...phrase(n.to as Expr), t("(simulated).")]);
        break;
      case "agent_set":
        line([t("set the"), v(String(n.prop)), t("of"), ...phrase(n.agent as Expr), t("to"), ...phrase(n.value as Expr), t(".")]);
        break;
      case "add_to_world":
        line([t("show"), ...phrase(n.item as Expr), t("in the project world.")]);
        break;
      case "update_feed":
        line([t("post"), ...phrase(n.message as Expr), t("to the feed.")]);
        break;
      case "notify":
        line([t("show the notification"), ...phrase(n.message as Expr), t(".")]);
        break;
      case "wait":
        line([t("wait"), ...phrase(n.seconds as Expr), t("seconds.")]);
        break;
      case "stop":
        line([t(n.scope === "all_scripts" ? "stop everything." : "stop this script.")]);
        break;
      default: {
        line([...generic(n), t(".")]);
        // Generic blocks with statement inputs (sequence, parallel, switch…): nest each one.
        const spec = resolveSpec(n);
        for (const row of spec?.rows ?? []) for (const item of row.items) if (item.kind === "statement") nest(irKey(item.name));
      }
    }
  }
  return out;
}

/** The program as plain-English sentences, one section per script. */
export function explainProgram(program: Program): ScriptExplanation[] {
  return program.scripts.map((s) => ({
    hatId: s.event.id,
    title: [t(s.event.disabled ? "(disabled) " : ""), v(describeHat(s.event)), t(":")].filter((p) => !("text" in p) || p.text),
    lines: lines(s.body, 0),
  }));
}

/** Plain text (for copying, the public page's meta description, tests). */
export function toText(parts: Part[]): string {
  return parts
    .map((p) => ("text" in p ? p.text : p.value))
    .join(" ")
    .replace(/\s+([.,:%)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+/g, " ")
    .trim();
}
