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

/** Read-only chain access for blocks like WALLET BALANCE. */
export interface ChainAdapter {
  readonly label: string;
  /** SOL balance, or null if it can't be read. */
  balance(wallet: string): Promise<number | null>;
  /** How many of a token (by mint) a wallet holds, or null if it can't be read. */
  tokenBalance(wallet: string, mint: string): Promise<number | null>;
}

export interface Adapters {
  ai: AiAdapter;
  web: WebAdapter;
  chain: ChainAdapter;
}

/** Deterministic fake balances (per wallet) for simulation. */
export function mockChain(): ChainAdapter {
  return {
    label: "simulated",
    async balance(wallet) {
      let h = 0;
      for (let i = 0; i < wallet.length; i++) h = (h * 31 + wallet.charCodeAt(i)) >>> 0;
      return Math.round(h % 5000) / 100;
    },
    async tokenBalance(wallet, mint) {
      // Simulated: about half of wallets hold any given token.
      let h = 7;
      for (const c of `${wallet}:${mint}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return h % 2 === 0 ? (h % 100_000) + 1 : 0;
    },
  };
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

export const mockAdapters = (rng: Rng): Adapters => ({ ai: mockAi(rng), web: mockWeb(rng), chain: mockChain() });

// ---------------------------------------------------------------------------
// Failsafe wrapper: every adapter answer is checked before a program sees it
// ---------------------------------------------------------------------------

/** A service a block needs didn't work. The run stops with this message. */
export class ServiceError extends Error {}

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 160);
const isText = (v: unknown): v is string => typeof v === "string";
const isPlain = (v: unknown): v is Record<string, Value> => !!v && typeof v === "object" && !Array.isArray(v);
const textOr = (v: unknown, fallback: string) => (isText(v) ? v : fallback);

/**
 * Wraps adapters so a program never sees a broken answer:
 * - AI: a call that fails or answers in the wrong shape gets `fallback`'s
 *   simple answer instead, and the label says why.
 * - Web: a failed call stops the run with a plain message (inventing web
 *   results would be wrong); odd results are cleaned up.
 * - Chain: a failed read is "unknown" (null).
 */
export function guarded(a: Adapters, fallback: AiAdapter): Adapters {
  let note: string | null = null;
  const ai = a.ai;
  async function call<T>(real: () => Promise<unknown>, ok: (v: unknown) => T | null, fall: () => Promise<T>): Promise<T> {
    try {
      const v = ok(await real());
      if (v !== null) {
        note = null;
        return v;
      }
      note = "the AI's answer wasn't usable";
    } catch (e) {
      note = reasonOf(e);
    }
    return fall();
  }
  const str = (v: unknown) => (isText(v) ? v : null);

  const safeAi: AiAdapter = {
    get label() {
      return note ? `fallback (${note})` : ai.label;
    },
    ask: (p) => call(() => ai.ask(p), str, () => fallback.ask(p)),
    structured: (p, fields) => call(() => ai.structured(p, fields), (v) => (isPlain(v) ? v : null), () => fallback.structured(p, fields)),
    choose: (options, criteria, display) =>
      call(
        () => ai.choose(options, criteria, display),
        (v) => {
          if (!isPlain(v)) return null;
          const index = Number(v.index);
          const valid = options.length ? Number.isInteger(index) && index >= 0 && index < options.length : index === -1;
          return valid ? { index, reason: textOr(v.reason, "") } : null;
        },
        () => fallback.choose(options, criteria, display),
      ),
    classify: (text, labels) => call(() => ai.classify(text, labels), str, () => fallback.classify(text, labels)),
    summarize: (text) => call(() => ai.summarize(text), str, () => fallback.summarize(text)),
    identity: (subject) =>
      call(
        () => ai.identity(subject),
        (v) => (isPlain(v) && isText(v.name) && v.name.trim() ? { name: v.name, personality: textOr(v.personality, ""), bio: textOr(v.bio, "") } : null),
        () => fallback.identity(subject),
      ),
    decide: (q) => call(() => ai.decide(q), (v) => (typeof v === "boolean" ? v : null), () => fallback.decide(q)),
    generateText: (kind, topic) => call(() => ai.generateText(kind, topic), str, () => fallback.generateText(kind, topic)),
    review: (content, criteria) =>
      call(
        () => ai.review(content, criteria),
        (v) => (isPlain(v) && Number.isFinite(Number(v.score)) ? { score: Math.max(0, Math.min(100, Math.round(Number(v.score)))), feedback: textOr(v.feedback, "") } : null),
        () => fallback.review(content, criteria),
      ),
    runAgent: (agent, task, tools, context) => call(() => ai.runAgent(agent, task, tools, context), str, () => fallback.runAgent(agent, task, tools, context)),
  };

  const web = a.web;
  const webCall = async <T>(what: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (e) {
      throw new ServiceError(`${what} didn't work right now (${reasonOf(e)}). The run stopped here; it will work again when the site answers.`);
    }
  };
  const safeWeb: WebAdapter = {
    get label() {
      return web.label;
    },
    search: (query) =>
      webCall("The web search", async () => {
        const r = await web.search(query);
        return (Array.isArray(r) ? r : []).filter(isPlain).map((x) => ({ title: textOr(x.title, ""), url: textOr(x.url, ""), snippet: textOr(x.snippet, "") }));
      }),
    open: (url) =>
      webCall("Opening that page", async () => {
        const p = (await web.open(url)) as unknown;
        if (!isPlain(p)) return { url, title: "", text: "", links: [] };
        return { url: textOr(p.url, url), title: textOr(p.title, ""), text: textOr(p.text, ""), links: Array.isArray(p.links) ? p.links.filter(isText) : [] };
      }),
  };

  const chain = a.chain;
  const safeChain: ChainAdapter = {
    get label() {
      return chain.label;
    },
    balance: async (wallet) => {
      try {
        const b = await chain.balance(wallet);
        return typeof b === "number" && Number.isFinite(b) ? b : null;
      } catch {
        return null;
      }
    },
    tokenBalance: async (wallet, mint) => {
      try {
        const b = await chain.tokenBalance(wallet, mint);
        return typeof b === "number" && Number.isFinite(b) && b >= 0 ? b : null;
      } catch {
        return null;
      }
    },
  };

  return { ai: safeAi, web: safeWeb, chain: safeChain };
}
