/**
 * Runtime values. Everything a program computes is plain JSON so runtime state
 * can be persisted as-is. Persistent things (agents, entities, bounties,
 * submissions) are passed around as references: { $ref: "agent", id }.
 */

export type RefKind = "agent" | "entity" | "bounty" | "submission";
// A type alias (not an interface) so refs are assignable to Value's index signature.
export type Ref = { $ref: RefKind; id: string };
export type Value = null | string | number | boolean | Value[] | { [key: string]: Value };

export const ref = ($ref: RefKind, id: string): Ref => ({ $ref, id });

export function isRef(v: unknown, kind?: RefKind): v is Ref {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as Ref).$ref === "string" &&
    typeof (v as Ref).id === "string" &&
    (kind === undefined || (v as Ref).$ref === kind)
  );
}

export const isObject = (v: unknown): v is { [key: string]: Value } =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const NUMERIC = /^\s*-?\d+(\.\d+)?\s*$/;

/** Scratch-like number coercion: "3" → 3, true → 1, anything else → 0. */
export function toNumber(v: Value | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && NUMERIC.test(v)) return Number(v);
  if (typeof v === "string") {
    // "0.03 SOL", "$20" — take the leading number, as people type amounts.
    const m = /-?\d+(\.\d+)?/.exec(v);
    return m ? Number(m[0]) : 0;
  }
  return 0;
}

export function truthy(v: Value | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v !== "" && v.toLowerCase() !== "false" && v !== "0";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function toList(v: Value | undefined): Value[] {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined || v === "") return [];
  if (typeof v === "string" && v.includes(","))
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [v];
}

/** Rounds away float noise (0.1 + 0.2) for display and money. */
export const round = (n: number, places = 6) => Math.round(n * 10 ** places) / 10 ** places;

/** Display text; refs resolve through `names` (agent → its name). */
export function toText(v: Value | undefined, names?: (r: Ref) => string | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(round(v));
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (isRef(v)) return names?.(v) ?? `${v.$ref} ${v.id}`;
  if (Array.isArray(v)) return v.map((x) => toText(x, names)).join(", ");
  return Object.entries(v)
    .map(([k, x]) => `${k}=${toText(x, names)}`)
    .join(", ");
}

/** Loose equality: numbers compare numerically, refs by identity, text case-insensitively. */
export function equals(a: Value | undefined, b: Value | undefined): boolean {
  if (isRef(a) || isRef(b)) return isRef(a) && isRef(b) && a.$ref === b.$ref && a.id === b.id;
  const numeric = (x: Value | undefined) =>
    typeof x === "number" || (typeof x === "string" && NUMERIC.test(x));
  if (numeric(a) && numeric(b)) return toNumber(a!) === toNumber(b!);
  if (typeof a === "boolean" || typeof b === "boolean") return truthy(a) === truthy(b);
  if (Array.isArray(a) || Array.isArray(b) || isObject(a) || isObject(b))
    return JSON.stringify(a) === JSON.stringify(b);
  return toText(a).toLowerCase() === toText(b).toLowerCase();
}

/** Ordering for > and <: numeric when both sides look numeric, else text. */
export function compareValues(a: Value | undefined, b: Value | undefined): number {
  const na = toNumber(a);
  const nb = toNumber(b);
  const looksNumeric = (x: Value | undefined) => typeof x === "number" || (typeof x === "string" && /\d/.test(x));
  if (looksNumeric(a) && looksNumeric(b)) return na - nb;
  return toText(a).localeCompare(toText(b));
}

/** JSON-safe deep copy for values pulled out of state. */
export const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
