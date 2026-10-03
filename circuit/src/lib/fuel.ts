/**
 * AI fuel: a live coin's AI is paid for by its own creator fees. There is no
 * budget to choose: AI blocks may spend up to FUEL_SHARE of the creator fees
 * the coin has earned since it went live, and nothing more. Past that, AI
 * blocks answer with simple fallbacks until more fees come in.
 *
 * Fees are measured from the coin's real trades as the server sees them
 * (trade size × the creator fee rate, priced in USD at the time), each
 * transaction counted once.
 */

/** Share of earned creator fees the coin's AI may spend. The rest is never touched. */
export const FUEL_SHARE = 0.9;
/** Rough price of one runtime AI block call (Haiku-class model). */
export const AI_COST_PER_CALL_USD = 0.001;
/** pump.fun creator share of each trade (bonding curve). Override with CIRCUIT_CREATOR_FEE_RATE. */
export const DEFAULT_CREATOR_FEE_RATE = 0.003;

export function creatorFeeRate(): number {
  const n = typeof process !== "undefined" ? Number(process.env?.CIRCUIT_CREATOR_FEE_RATE) : NaN;
  return Number.isFinite(n) && n > 0 && n < 0.1 ? n : DEFAULT_CREATOR_FEE_RATE;
}

/** Creator fees (USD) earned by trades of `amountSol` total at `solUsd`. */
export const feesUsd = (amountSol: number, solUsd: number, rate = creatorFeeRate()) =>
  Number.isFinite(amountSol) && amountSol > 0 && Number.isFinite(solUsd) && solUsd > 0 ? amountSol * rate * solUsd : 0;

export interface FuelTotals {
  /** Creator fees earned since going live (USD, estimated from trades). */
  feesUsd: number;
  /** Spent on AI since going live (USD). */
  spentUsd: number;
  calls: number;
}

export interface Fuel extends FuelTotals {
  /** Most the AI may ever spend: FUEL_SHARE of fees. */
  capUsd: number;
  /** What's left to spend now. */
  leftUsd: number;
  /** AI calls the fuel left pays for. */
  callsLeft: number;
  state: "healthy" | "low" | "empty";
}

export function fuelOf(t: FuelTotals): Fuel {
  const capUsd = Math.max(0, t.feesUsd * FUEL_SHARE);
  const leftUsd = Math.max(0, capUsd - t.spentUsd);
  const callsLeft = Math.floor(leftUsd / AI_COST_PER_CALL_USD + 1e-9);
  const state = callsLeft < 1 ? "empty" : leftUsd < capUsd * 0.15 ? "low" : "healthy";
  return { ...t, capUsd, leftUsd, callsLeft, state };
}
