/**
 * What AI calls really cost: priced from the token counts Anthropic reports
 * on every response, so Circuit's numbers match the bill.
 */

/** USD per million tokens. Cache writes cost 1.25x input (5-minute cache), cache reads 0.1x. */
interface Price {
  input: number;
  output: number;
}

/** First matching prefix wins (dated ids like claude-haiku-4-5-20251001 match their family). */
const PRICES: [prefix: string, price: Price][] = [
  ["claude-fable-5", { input: 10, output: 50 }],
  ["claude-mythos-5", { input: 10, output: 50 }],
  ["claude-opus-5-5", { input: 4, output: 20 }],
  ["claude-opus-5", { input: 5, output: 25 }],
  ["claude-opus-4", { input: 5, output: 25 }],
  ["claude-sonnet-5", { input: 2, output: 10 }],
  ["claude-sonnet-4", { input: 3, output: 15 }],
  ["claude-haiku-4-5", { input: 1, output: 5 }],
];
/** Unknown models are priced at the most expensive rate, so the meter never under-counts. */
const UNKNOWN: Price = { input: 10, output: 50 };

export const priceOf = (model: string): Price => PRICES.find(([p]) => model.startsWith(p))?.[1] ?? UNKNOWN;

/** The usage fields of a Messages API response that cost money. */
export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function costOf(model: string, u: TokenUsage): number {
  const p = priceOf(model);
  const n = (x: number | null | undefined) => (typeof x === "number" && x > 0 ? x : 0);
  return (n(u.input_tokens) * p.input + n(u.cache_creation_input_tokens) * p.input * 1.25 + n(u.cache_read_input_tokens) * p.input * 0.1 + n(u.output_tokens) * p.output) / 1e6;
}

/** The most the whole server may spend on AI per UTC day (CIRCUIT_AI_DAILY_USD, default $5). Everything stops there. */
export function aiDailyCapUsd(): number {
  const n = Number(process.env.CIRCUIT_AI_DAILY_USD);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}
