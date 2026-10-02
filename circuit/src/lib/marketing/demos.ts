/**
 * Programs shown as pictures on the marketing pages. They're ordinary Circuit
 * IR, drawn with the studio's real blocks, so what people see is exactly what
 * they'd build. Block ids let the pages animate individual blocks.
 */
import { formatIssues, parseProgram, type Program } from "@/lib/ir";

const v = (name: string) => ({ type: "var", var: name });
const ev = (field: string) => ({ type: "event_field", field });

function program(scripts: unknown[]): Program {
  const r = parseProgram({ version: 1, scripts });
  if (!r.ok) throw new Error(`Demo program is invalid:\n${formatIssues(r.issues)}`);
  return r.program;
}

/** "Build it like Lego": assembled one piece at a time. */
export const LEGO = program([
  {
    event: { id: "l1", type: "volume_changed" },
    body: [
      {
        id: "l2",
        type: "if",
        condition: { id: "lv", type: "compare", a: ev("amount"), op: "gte", b: 10 },
        then: [
          { id: "l3", type: "create_agent", nameMode: "ai_generated", identityMode: "ai_generated", personalityMode: "ai_generated", speciesMode: "random_from_list", species: "penguin, otter, owl", var: "agent" },
          { id: "l4", type: "agent_set", prop: "goal", agent: v("agent"), value: { id: "lr", type: "random_item", list: ["trade", "explore", "collect"] } },
        ],
      },
    ],
  },
]);

/** The steps that go with LEGO, and which blocks are on the canvas at each one. */
export const LEGO_STEPS: { text: string; hidden: string[]; target: string | null }[] = [
  { text: "Drag WHEN VOLUME CHANGES onto the canvas", hidden: ["l2", "lv", "l3", "l4", "lr"], target: "l1" },
  { text: "Attach IF beneath it", hidden: ["lv", "l3", "l4", "lr"], target: "l2" },
  { text: "Plug a comparison into the condition", hidden: ["l3", "l4", "lr"], target: "lv" },
  { text: "Drop CREATE AGENT inside IF", hidden: ["l4", "lr"], target: "l3" },
  { text: "Give it a goal with RANDOM ITEM", hidden: [], target: "lr" },
];

/** "Or describe it": what Build with AI makes from the example sentence. */
export const DIARY = program([
  {
    event: { id: "w1", type: "trade", side: "buy" },
    body: [
      {
        id: "w2",
        type: "if",
        condition: { type: "compare", a: ev("amount"), op: "gt", b: 5 },
        then: [
          { id: "w3", type: "create_agent", nameMode: "ai_generated", identityMode: "ai_generated", speciesMode: "ai_generated", personalityMode: "free_text", personality: "stoic, chaotic or poetic", var: "agent" },
          { id: "w4", type: "add_to_world", item: v("agent") },
        ],
      },
    ],
  },
  {
    event: { id: "w5", type: "every_minutes", minutes: 60 },
    body: [
      {
        id: "w6",
        type: "for_each",
        var: "character",
        list: { type: "all_agents" },
        do: [
          { id: "w7", type: "set_var", var: "entry", value: { type: "ai_ask", prompt: "Write one diary entry as {character}" } },
          { id: "w8", type: "update_feed", message: "{character}'s diary: {entry}" },
        ],
      },
    ],
  },
]);
export const DIARY_PROMPT =
  "When someone buys more than 5 SOL, create an AI character. Give it a random personality. Every hour, let it write one diary entry.";

/** "Watch it run": the debugger steps through these blocks. */
export const DEBUG = program([
  {
    event: { id: "d1", type: "volume_milestone", amount: 10 },
    body: [
      {
        id: "d2",
        type: "if",
        condition: { type: "compare", a: { type: "treasury", asset: "SOL" }, op: "gte", b: 1 },
        then: [
          { id: "d3", type: "create_agent", nameMode: "ai_generated", identityMode: "ai_generated", personalityMode: "ai_generated", speciesMode: "random_from_list", species: "otter, owl, fox", var: "agent" },
          { id: "d4", type: "update_feed", message: "{agent} joined the crew" },
        ],
      },
    ],
  },
]);
export const DEBUG_ROWS = [
  { id: "d1", label: "EVERY 10 SOL OF VOLUME" },
  { id: "d2", label: "IF treasury ≥ 1 SOL" },
  { id: "d3", label: "CREATE AGENT" },
  { id: "d4", label: "POST TO FEED" },
];

/** "From idea to program": a tiny program. */
export const TINY = program([
  {
    event: { type: "trade", side: "any_side" },
    body: [{ type: "update_feed", message: { type: "ai_ask", prompt: "React to this trade in five words." } }],
  },
]);

/** The closing call to action: an event with nothing attached yet. */
export const BLANK = program([{ event: { type: "trade", side: "any_side" }, body: [] }]);

/** Number of blocks in a program (what the builder shows as N BLOCKS). */
export function countBlocks(program: Program): number {
  let n = 0;
  const visit = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(visit);
    const node = v as Record<string, unknown>;
    if (typeof node.type === "string") n++;
    Object.entries(node).forEach(([k, x]) => k !== "position" && visit(x));
  };
  program.scripts.forEach((s) => {
    visit(s.event);
    visit(s.body);
  });
  return n;
}
