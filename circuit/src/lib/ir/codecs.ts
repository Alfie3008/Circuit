/** Text-field ⇄ IR value codecs for `format: "list" | "pairs"` fields. */

export type Scalar = string | number | boolean;

const NUMERIC = /^-?\d+(\.\d+)?$/;

/** "3" → 3, but only when it prints back identically ("03" stays a string). */
function scalar(raw: string, allowBool: boolean): Scalar {
  const t = raw.trim();
  if (NUMERIC.test(t) && String(Number(t)) === t) return Number(t);
  if (allowBool && (t === "true" || t === "false")) return t === "true";
  return t;
}

/** "NVDA, TSLA, 3" → ["NVDA", "TSLA", 3]. Empty items are dropped. */
export function parseList(text: string): (string | number)[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => scalar(s, false) as string | number);
}

export function formatList(items: (string | number)[]): string {
  return items.map(String).join(", ");
}

/** "mood=happy, score=1, alive=true" → { mood: "happy", score: 1, alive: true }. */
export function parsePairs(text: string): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  for (const part of text.split(",")) {
    if (!part.trim()) continue;
    const eq = part.indexOf("=");
    const key = (eq === -1 ? part : part.slice(0, eq)).trim();
    if (key) out[key] = eq === -1 ? "" : scalar(part.slice(eq + 1), true);
  }
  return out;
}

export function formatPairs(pairs: Record<string, Scalar>): string {
  return Object.entries(pairs)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}
