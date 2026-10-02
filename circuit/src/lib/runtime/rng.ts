/**
 * Seeded randomness (mulberry32). The seed lives in runtime state, so a
 * project's random choices continue across reloads instead of repeating, and
 * tests can pin them.
 */
export class Rng {
  constructor(public seed: number) {}

  /** Uniform in [0, 1). */
  next(): number {
    let t = (this.seed = (this.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(items: readonly T[]): T | undefined {
    return items.length ? items[Math.floor(this.next() * items.length)] : undefined;
  }

  /** Float in [min, max), rounded to `places`. */
  range(min: number, max: number, places = 2): number {
    const p = 10 ** places;
    return Math.round((min + this.next() * (max - min)) * p) / p;
  }
}

/** Stable small hash for deterministic mock data (wallet balances, etc.). */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
