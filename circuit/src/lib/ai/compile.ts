/**
 * The AI COMPILER: natural language → Circuit IR → validated program.
 *
 * Claude only ever produces IR (data). The same validator that checks
 * imported files checks its output; validation errors go back to the model
 * for a repair attempt. Nothing it writes is executed as code.
 */
import { irKey, itemsOf, IR_VARIANTS, kindOf, formatIssues, parseProgram, type Program } from "@/lib/ir";
import type { BlockSpec } from "@/lib/blocks/types";
import { AiError, extractJson, type ModelCaller } from "./model";

/** Max repair rounds after the first attempt. */
export const MAX_REPAIRS = 2;
export const MAX_PROMPT_CHARS = 2000;

function describeItem(item: ReturnType<typeof itemsOf>[number]): string {
  switch (item.kind) {
    case "text":
      return item.format === "list" ? "list of text/numbers" : item.format === "pairs" ? "object {key: value}" : "text";
    case "number":
      return `number${item.min !== undefined || item.max !== undefined ? ` (${item.min ?? ""}..${item.max ?? ""})` : ""}`;
    case "dropdown":
      return item.options.map((o) => JSON.stringify(o[1])).join("|");
    case "checkbox":
      return "boolean";
    case "variable":
      return "variable name";
    case "value":
      return `Expr${item.check ? `<${item.check.join("|")}>` : ""}`;
    case "statement":
      return "Stmt[]";
  }
}

/** One line per IR node type, generated from the block registry. */
export function blockCatalog(): string {
  const groups: Record<string, string[]> = { event: [], stmt: [], expr: [] };
  for (const [ir, specs] of IR_VARIANTS) {
    const keys = new Map<string, string>();
    for (const spec of specs) for (const item of itemsOf(spec)) keys.set(irKey(item.name), describeItem(item));
    const spec: BlockSpec = specs[0];
    const fields = [...keys].map(([k, d]) => `${k}: ${d}`).join("; ");
    const outputs = spec.eventOutputs?.length ? ` Event fields: ${spec.eventOutputs.join(", ")}.` : "";
    const sim = spec.simulated ? " (simulated)" : "";
    groups[kindOf(spec)].push(`- ${ir} { ${fields} }: ${spec.tooltip}${sim}${outputs}`);
  }
  return [
    "EVENTS (script hats):",
    ...groups.event,
    "",
    "STATEMENTS:",
    ...groups.stmt,
    "",
    "EXPRESSIONS:",
    ...groups.expr,
  ].join("\n");
}

export function compileSystemPrompt(): string {
  return `You are the compiler inside CIRCUIT, a visual programming language for crypto projects. You turn a creator's description into a Circuit IR program: JSON that becomes snap-together blocks they can edit.

PROGRAM SHAPE
{ "version": 1, "variables": [names], "scripts": [ { "event": EventNode, "body": [Stmt, ...] } ] }
Every script starts with exactly one event. Statements run top to bottom. A node is { "type": "<ir type>", ...fields }.

EXPRESSIONS
An Expr is a literal (3, "META", true, ["a", "b"]) or an expression node such as { "type": "var", "var": "score" } or { "type": "event_field", "field": "amount" }. Use null for an input you deliberately leave empty. You may omit a field to use the block's default.

TEXT
Text values can include {variableName} or {event.field}; they are filled in when the program runs.

VARIABLES
Variables are global and keep their values between runs. Blocks with a "var" field store their result in that variable (CREATE AGENT stores the agent; use { "type": "var", "var": "agent" } to refer to it later). List every variable you use in "variables".

RULES
- Use only the node types and fields listed below, with exactly those field names and option values.
- Prefer generic blocks. There is no "spawn rat" block: a rat is CREATE AGENT with species "rat".
- Finance blocks are simulated. Never claim money really moves.
- Keep programs small and readable: the fewest blocks that do what was asked.
- If a request needs something no block can do, build the closest program and say what's missing in the explanation.

OUTPUT
Reply with only a JSON object, no prose around it:
{ "explanation": "<one or two plain sentences on what the program does>", "program": <Program> }

BLOCKS
${blockCatalog()}`;
}

export interface CompileResult {
  program: Program;
  explanation: string;
  attempts: number;
}

/** Compiles `prompt` with `call`, feeding validation errors back for repair. */
export async function compileWithModel(prompt: string, call: ModelCaller, model: string): Promise<CompileResult> {
  const request = prompt.trim().slice(0, MAX_PROMPT_CHARS);
  if (!request) throw new AiError("Describe what you want the program to do.", 400);

  const system = compileSystemPrompt();
  const messages: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: request }];
  let lastProblem = "";

  for (let attempt = 1; attempt <= MAX_REPAIRS + 1; attempt++) {
    const reply = await call({ model, system, messages, maxTokens: 16000 });
    let problem: string;
    try {
      const json = extractJson(reply) as { explanation?: unknown; program?: unknown };
      const parsed = parseProgram(json.program ?? json);
      if (parsed.ok) {
        const explanation = typeof json.explanation === "string" ? json.explanation : "";
        return { program: parsed.program, explanation, attempts: attempt };
      }
      problem = `The program didn't validate:\n${formatIssues(parsed.issues.slice(0, 12))}`;
    } catch (e) {
      problem = `That wasn't a valid JSON object (${(e as Error).message}).`;
    }
    lastProblem = problem;
    messages.push({ role: "assistant", content: reply });
    messages.push({ role: "user", content: `${problem}\nFix it and reply with the complete corrected JSON object only.` });
  }
  throw new AiError(`The AI couldn't produce a valid program. Last problem: ${lastProblem}`, 502);
}
