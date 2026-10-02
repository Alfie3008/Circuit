/**
 * Example prompts with hand-written Circuit IR: what Build with AI returns
 * when no API key is configured (offline demo), and a regression set for the
 * real compiler. Each program is validated at load.
 */
import { formatIssues, parseProgram, type IRNode, type Program } from "@/lib/ir";

export interface Example {
  prompt: string;
  explanation: string;
  program: Program;
}

const v = (name: string): IRNode => ({ type: "var", var: name });
const ev = (field: string): IRNode => ({ type: "event_field", field });
const pos = (x: number, y = 40) => ({ x, y });

const RAW: { prompt: string; explanation: string; scripts: unknown[] }[] = [
  {
    prompt: "Every 5 SOL of volume, create a random animal agent. Give it a funny AI-generated identity and add it to my website.",
    explanation: "Every 5 SOL of volume creates an animal agent with an AI-generated name, identity and personality, then shows it in the project world.",
    scripts: [
      {
        position: pos(40),
        event: { type: "volume_milestone", amount: 5 },
        body: [
          {
            type: "create_agent",
            nameMode: "ai_generated",
            identityMode: "ai_generated",
            personalityMode: "ai_generated",
            speciesMode: "random_from_list",
            species: "cat, dog, otter, penguin, capybara, frog, owl",
            var: "agent",
          },
          { type: "add_to_world", item: v("agent") },
          { type: "update_feed", message: "{agent} just arrived" },
        ],
      },
    ],
  },
  {
    prompt: "Whenever the treasury receives 0.1 SOL, wake an explorer agent and have it save a new web finding.",
    explanation: "When the treasury wallet receives at least 0.1 SOL, an explorer agent (created the first time) runs, searches the web and saves a finding.",
    scripts: [
      {
        position: pos(40),
        event: { type: "wallet_receives", wallet: "treasury" },
        body: [
          {
            type: "if",
            condition: { type: "compare", a: ev("amount"), op: "gte", b: 0.1 },
            then: [
              {
                type: "if",
                condition: { type: "not", value: { type: "exists", value: v("explorer") } },
                then: [
                  { type: "create_agent", nameMode: "manual", name: "Explorer", speciesMode: "free_text", species: "owl", personalityMode: "free_text", personality: "Curious", goal: "Find strange websites", var: "explorer" },
                ],
              },
              { type: "run_agent", agent: v("explorer"), task: "Find something new and strange on the web.", toolBrowser: true, resultVar: "result" },
              { type: "set_var", var: "page", value: { type: "random_item", list: { type: "web_search", query: { type: "ai_ask", prompt: "Name one odd topic worth researching" } } } },
              { type: "save_finding", title: { type: "get_key", key: "title", object: v("page") }, content: { type: "get_key", key: "snippet", object: v("page") }, agent: v("explorer") },
              { type: "update_feed", message: "{explorer} saved a new finding" },
            ],
          },
        ],
      },
    ],
  },
  {
    prompt: "Every hour, randomly select one existing agent and have AI generate a diary entry.",
    explanation: "Every 60 minutes one random agent writes an AI-generated diary entry, which it remembers and posts to the feed.",
    scripts: [
      {
        position: pos(40),
        event: { type: "every_minutes", minutes: 60 },
        body: [
          { type: "set_var", var: "agent", value: { type: "random_agent" } },
          {
            type: "if",
            condition: { type: "exists", value: v("agent") },
            then: [
              { type: "set_var", var: "entry", value: { type: "generate_text", kind: "diary_entry", topic: { type: "agent_get", prop: "name", agent: v("agent") } } },
              { type: "agent_remember", memory: v("entry"), agent: v("agent") },
              { type: "update_feed", message: "{agent}'s diary: {entry}" },
            ],
          },
        ],
      },
    ],
  },
  {
    prompt: "When holder count reaches 1,000, generate a collectible and add it to the project gallery.",
    explanation: "When holders cross 1,000, an image is generated and saved as a collectible in the gallery collection.",
    scripts: [
      {
        position: pos(40),
        event: { type: "holder_count_crosses", direction: "above", threshold: 1000 },
        body: [
          { type: "set_var", var: "image", value: { type: "generate_image", prompt: "A collectible celebrating 1,000 holders", style: "sticker" } },
          { type: "create_entity", entityType: "collectible", name: "1,000 Holders", image: v("image"), var: "collectible" },
          { type: "add_to_collection", item: v("collectible"), collection: "gallery" },
          { type: "update_feed", message: "1,000 holders! A new collectible joined the gallery." },
        ],
      },
    ],
  },
  {
    prompt: "When someone submits work to a bounty, have AI score it. If the score is above 80, approve it.",
    explanation: "Each bounty submission is reviewed by AI; scores above 80 are approved, the rest rejected.",
    scripts: [
      {
        position: pos(40),
        event: { type: "bounty_submission" },
        body: [
          { type: "set_var", var: "review", value: { type: "ai_review", submission: ev("submission"), criteria: "quality and originality" } },
          { type: "set_var", var: "score", value: { type: "get_key", key: "score", object: v("review") } },
          {
            type: "if",
            condition: { type: "compare", a: v("score"), op: "gt", b: 80 },
            then: [
              { type: "approve_submission", submission: ev("submission") },
              { type: "update_feed", message: "Submission approved (score {score})" },
            ],
            else: [
              { type: "reject_submission", submission: ev("submission") },
              { type: "update_feed", message: "Submission scored {score}: not approved" },
            ],
          },
        ],
      },
    ],
  },
];

export const EXAMPLES: Example[] = RAW.map((e) => {
  const parsed = parseProgram({ version: 1, scripts: e.scripts });
  if (!parsed.ok) throw new Error(`Example "${e.prompt}" is invalid:\n${formatIssues(parsed.issues)}`);
  return { prompt: e.prompt, explanation: e.explanation, program: parsed.program };
});

export const EXAMPLE_PROMPTS = RAW.map((e) => e.prompt);

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);

/** The example a prompt (near-)matches, for the offline demo. */
export function matchExample(prompt: string): Example | undefined {
  const asked = words(prompt);
  let best: { example: Example; score: number } | undefined;
  for (const example of EXAMPLES) {
    const known = words(example.prompt);
    const overlap = [...known].filter((w) => asked.has(w)).length;
    const score = overlap / Math.max(known.size, asked.size);
    if (!best || score > best.score) best = { example, score };
  }
  return best && best.score >= 0.6 ? best.example : undefined;
}
