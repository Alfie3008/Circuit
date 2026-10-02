/**
 * Adapters are the only way a program touches the outside world. The
 * interpreter calls these interfaces; the prototype ships deterministic mocks
 * (Phase 5 swaps the AI adapter for real calls via /api/ai, Phase 6 adds a
 * read-only Solana adapter). Money never moves: finance is handled in-state
 * and every receipt says SIMULATED.
 */
import type { Rng } from "./rng";
import type { Agent } from "./state";
import type { Value } from "./values";

export interface Identity {
  name: string;
  personality: string;
  bio: string;
}

export interface AiAdapter {
  /** Shown in receipts, e.g. "mock" or a model name. */
  readonly label: string;
  ask(prompt: string): Promise<string>;
  structured(prompt: string, fields: string[]): Promise<Record<string, Value>>;
  choose(options: Value[], criteria: string, display: (v: Value) => string): Promise<{ index: number; reason: string }>;
  classify(text: string, labels: string[]): Promise<string>;
  summarize(text: string): Promise<string>;
  identity(subject: string): Promise<Identity>;
  decide(question: string): Promise<boolean>;
  generateText(kind: string, topic: string): Promise<string>;
  review(content: string, criteria: string): Promise<{ score: number; feedback: string }>;
  runAgent(agent: Agent, task: string, tools: string[], context: string): Promise<string>;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}
export interface Page {
  url: string;
  title: string;
  text: string;
  links: string[];
}

export interface WebAdapter {
  readonly label: string;
  search(query: string): Promise<SearchResult[]>;
  open(url: string): Promise<Page>;
}

export interface Adapters {
  ai: AiAdapter;
  web: WebAdapter;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

export const NAMES = ["Mochi", "Pickle", "Juniper", "Biscuit", "Nori", "Waffles", "Pip", "Tofu", "Bongo", "Clementine", "Rascal", "Sprout"];
export const SPECIES = ["penguin", "otter", "raccoon", "capybara", "owl", "axolotl", "fox", "hedgehog"];
export const PERSONALITIES = [
  "Overconfident portfolio manager",
  "Anxious day trader",
  "Retired quant who still checks charts",
  "Momentum-chasing optimist",
  "Contrarian with a podcast",
  "Patient index-fund monk",
  "Chaotic meme historian",
  "Stoic collector of odd facts",
];
const TOPICS = ["lighthouses for sale", "abandoned malls", "competitive birdwatching", "tiny museums", "vintage calculators", "cloud spotting societies"];
const SENTENCES = [
  "Honestly, the vibes are bullish.",
  "I'd wait for one more green candle.",
  "This is either genius or a cry for help.",
  "Fortune favours the slightly confused.",
  "The chart says yes. My heart says also yes.",
  "Tiny steps, big dreams.",
];

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Deterministic, offline AI stand-in. Plausible enough to watch a program run. */
export function mockAi(rng: Rng): AiAdapter {
  const pick = <T>(xs: readonly T[]) => rng.pick(xs)!;
  return {
    label: "mock",
    async ask(prompt) {
      return `${pick(SENTENCES)} (re: ${clip(prompt, 48)})`;
    },
    async structured(_prompt, fields) {
      const out: Record<string, Value> = {};
      for (const f of fields.length ? fields : ["answer"]) {
        const k = f.toLowerCase();
        out[f] = /score|rating|number|count|amount/.test(k)
          ? rng.int(1, 100)
          : /name/.test(k)
            ? pick(NAMES)
            : /species|animal|type/.test(k)
              ? pick(SPECIES)
              : /personality|mood/.test(k)
                ? pick(PERSONALITIES)
                : pick(SENTENCES);
      }
      return out;
    },
    async choose(options) {
      const index = options.length ? rng.int(0, options.length - 1) : -1;
      return { index, reason: "It felt right." };
    },
    async classify(_text, labels) {
      return labels.length ? pick(labels) : "unknown";
    },
    async summarize(text) {
      const first = text.split(/(?<=[.!?])\s/)[0] ?? text;
      return clip(first, 120);
    },
    async identity(subject) {
      const name = pick(NAMES);
      const personality = pick(PERSONALITIES);
      return { name, personality, bio: `${name} is a ${subject || "character"}. ${personality}.` };
    },
    async decide() {
      return rng.next() < 0.5;
    },
    async generateText(kind, topic) {
      const t = topic || pick(TOPICS);
      switch (kind) {
        case "diary_entry":
          return `Dear diary, today I thought about ${t}. ${pick(SENTENCES)}`;
        case "tweet":
          return `${t} szn. ${pick(SENTENCES)}`;
        case "story":
          return `Once, someone set out to find ${t}. They found something stranger.`;
        default:
          return `${t}: ${pick(SENTENCES)}`;
      }
    },
    async review() {
      const score = rng.int(40, 98);
      return { score, feedback: score >= 80 ? "Original and well made." : "Decent, but feels familiar." };
    },
    async runAgent(agent, task) {
      return `${agent.name} worked on “${clip(task || "its goal", 60)}”. ${pick(SENTENCES)}`;
    },
  };
}

/** Offline web stand-in: fake but well-formed results and pages. */
export function mockWeb(rng: Rng): WebAdapter {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
  const page = (url: string): Page => {
    const topic = url.split("/").pop()?.replace(/-/g, " ") || "something strange";
    return {
      url,
      title: topic.replace(/\b\w/g, (c) => c.toUpperCase()),
      text: `A page about ${topic}. ${rng.pick(SENTENCES)} It links to a few related oddities.`,
      links: [1, 2, 3].map((i) => `https://example.org/${slug(rng.pick(TOPICS)!)}-${i}`),
    };
  };
  return {
    label: "mock",
    async search(query) {
      const q = query || rng.pick(TOPICS)!;
      return [1, 2, 3].map((i) => ({
        title: `${q} — result ${i}`,
        url: `https://example.org/${slug(q)}-${i}`,
        snippet: `${rng.pick(SENTENCES)}`,
      }));
    },
    async open(url) {
      return page(url || `https://example.org/${slug(rng.pick(TOPICS)!)}`);
    },
  };
}

export const mockAdapters = (rng: Rng): Adapters => ({ ai: mockAi(rng), web: mockWeb(rng) });
