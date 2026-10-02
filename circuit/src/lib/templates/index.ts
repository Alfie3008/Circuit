/**
 * Starter templates, written as Circuit IR (the same form the AI compiler
 * emits). None of them uses a project-specific primitive: a "crew member" is
 * just CREATE AGENT with a species list, a "shop" is a budget plus entities.
 */
import { formatIssues, parseProgram, type IRNode, type Program } from "@/lib/ir";

export interface Template {
  id: string;
  name: string;
  description: string;
  /** What to press to see it work. */
  tryIt: string;
  program: Program;
}

const v = (name: string): IRNode => ({ type: "var", var: name });
const ev = (field: string): IRNode => ({ type: "event_field", field });

/** Creates `name` once (first run) and shows it in the world. */
const ensureAgent = (name: string, agent: Record<string, unknown>): IRNode => ({
  type: "if",
  condition: { type: "not", value: { type: "exists", value: v(name) } },
  then: [
    { type: "create_agent", nameMode: "manual", identityMode: "custom", speciesMode: "free_text", personalityMode: "free_text", ...agent, var: name },
    { type: "add_to_world", item: v(name) },
  ],
});

const RAW: Omit<Template, "program">[] & { program: unknown }[] = [
  {
    id: "living-crew",
    name: "Living Crew",
    description: "Every 10 SOL of volume creates a unique AI character that picks an asset and joins the world.",
    tryIt: "Press +10 SOL in the World panel.",
    program: {
      version: 1,
      scripts: [
        {
          position: { x: 40, y: 40 },
          event: { type: "volume_milestone", amount: 10 },
          body: [
            {
              type: "create_agent",
              nameMode: "ai_generated",
              identityMode: "ai_generated",
              personalityMode: "ai_generated",
              speciesMode: "random_from_list",
              species: "cat, frog, penguin, raccoon, dog, capybara",
              var: "agent",
            },
            { type: "set_var", var: "selectedAsset", value: { type: "random_item", list: ["NVDA", "TSLA", "AAPL", "META", "AMD"] } },
            { type: "sim_buy", asset: v("selectedAsset"), amount: 0.03, unit: "SOL" },
            { type: "agent_set", prop: "holdings", agent: v("agent"), value: v("selectedAsset") },
            { type: "add_to_world", item: v("agent") },
            { type: "update_feed", message: "{agent} joined the crew and bought {selectedAsset}" },
          ],
        },
      ],
    },
  },
  {
    id: "web-explorer",
    name: "Web Explorer",
    description: "Creator fees fill a compute budget. Once there's enough, an explorer agent researches something strange and saves what it finds.",
    tryIt: "Press Fees a few times.",
    program: {
      version: 1,
      scripts: [
        {
          position: { x: 40, y: 40 },
          event: { type: "creator_fees" },
          body: [
            { type: "budget_add", amount: ev("amount"), name: "computeBudget" },
            {
              type: "if",
              condition: { type: "budget_check", name: "computeBudget", amount: 0.2 },
              then: [
                ensureAgent("explorer", {
                  name: "Explorer",
                  species: "owl",
                  identity: "A night-shift researcher of the odd corners of the web.",
                  personality: "Curious and easily distracted",
                  goal: "Find strange websites",
                }),
                { type: "run_agent", agent: v("explorer"), task: "Explore something strange on the web.", toolBrowser: true, resultVar: "result" },
                {
                  type: "set_var",
                  var: "page",
                  value: { type: "web_open", url: { type: "random_item", list: { type: "web_search", query: { type: "ai_ask", prompt: "Pick an odd topic to research" } } } },
                },
                {
                  type: "save_finding",
                  title: { type: "get_key", key: "title", object: v("page") },
                  content: { type: "web_extract", page: v("page") },
                  agent: v("explorer"),
                },
                { type: "budget_spend", amount: 0.2, name: "computeBudget" },
                { type: "update_feed", message: "{explorer} found something strange" },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "autonomous-shopper",
    name: "Autonomous Shopper",
    description: "Fees build a purchase budget. When it reaches 0.5 SOL, a shopper agent picks something and buys it (simulated) for the shelf.",
    tryIt: "Press Fees until the budget passes 0.5 SOL.",
    program: {
      version: 1,
      scripts: [
        {
          position: { x: 40, y: 40 },
          event: { type: "creator_fees" },
          body: [
            { type: "budget_add", amount: ev("amount"), name: "purchaseBudget" },
            {
              type: "if",
              condition: { type: "budget_check", name: "purchaseBudget", amount: 0.5 },
              then: [
                ensureAgent("shopper", {
                  name: "Shopper",
                  species: "raccoon",
                  identity: "Runs the project's tiny shop.",
                  personality: "Thrifty, but impulsive",
                  goal: "Buy small, delightful things",
                }),
                { type: "run_agent", agent: v("shopper"), task: "Choose one item to buy with the budget.", resultVar: "result" },
                {
                  type: "set_var",
                  var: "item",
                  value: { type: "ai_choose", options: ["tiny cactus", "vintage calculator", "rubber duck", "mystery seeds", "pixel lamp"], criteria: "delightful and under budget" },
                },
                { type: "budget_spend", amount: 0.5, name: "purchaseBudget" },
                { type: "create_entity", entityType: "purchased item", name: v("item"), props: { type: "object", pairs: { price: "0.5 SOL" } }, var: "purchase" },
                { type: "add_to_collection", item: v("item"), collection: "shelf" },
                { type: "update_feed", message: "{shopper} bought a {item} (simulated, 0.5 SOL)" },
              ],
            },
          ],
        },
      ],
    },
  },
  {
    id: "creator-engine",
    name: "Creator Engine",
    description: "Volume opens a bounty. Each submission is reviewed by AI; good ones are approved and rewarded (simulated), the rest rejected.",
    tryIt: "Press +10 SOL five times (50 SOL), or press Submission once a bounty is open.",
    program: {
      version: 1,
      scripts: [
        {
          position: { x: 40, y: 40 },
          event: { type: "volume_milestone", amount: 50 },
          body: [
            { type: "create_bounty", title: "Make the best meme", description: "Original memes about the project.", reward: 0.2, hours: 24, var: "bounty" },
            { type: "update_feed", message: "New bounty: Make the best meme (0.2 SOL)" },
            { type: "await_submission", bounty: v("bounty") },
          ],
        },
        {
          position: { x: 560, y: 40 },
          event: { type: "bounty_submission" },
          body: [
            { type: "set_var", var: "review", value: { type: "ai_review", submission: ev("submission"), criteria: "originality" } },
            { type: "set_var", var: "score", value: { type: "get_key", key: "score", object: v("review") } },
            {
              type: "if",
              condition: { type: "compare", a: v("score"), op: "gte", b: 80 },
              then: [
                { type: "approve_submission", submission: ev("submission") },
                { type: "sim_reward", submission: ev("submission") },
                { type: "update_feed", message: "Submission scored {score}: approved and rewarded 0.2 SOL" },
              ],
              else: [
                { type: "reject_submission", submission: ev("submission") },
                { type: "update_feed", message: "Submission scored {score}: not this time" },
              ],
            },
          ],
        },
      ],
    },
  },
];

/** Validated templates. A template that doesn't validate is a bug: fail loudly. */
export const TEMPLATES: Template[] = RAW.map((t) => {
  const parsed = parseProgram(t.program);
  if (!parsed.ok) throw new Error(`Template "${t.id}" is invalid:\n${formatIssues(parsed.issues)}`);
  return { ...t, program: parsed.program } as Template;
});

export const getTemplate = (id: string) => TEMPLATES.find((t) => t.id === id);
