/** Colours the proof components use (from the design handoff). */
export const OK = "oklch(0.80 0.13 155)";
export const SIG = "oklch(0.84 0.15 80)";
export const ERR = "oklch(0.68 0.19 25)";
export const VAL = "oklch(0.86 0.06 235)";
/** `oklch(l c h)` → `oklch(l c h / a)`. */
export const alpha = (c: string, a: number) => c.replace(")", ` / ${a})`);
export const valuePill =
  "rounded-[4px] border border-[oklch(0.42_0.05_235)] bg-[oklch(0.29_0.035_235)] px-1.5 font-mono text-[11.5px] text-[oklch(0.88_0.06_235)]";
export const simChip = "rounded-[3px] border border-signal/45 px-[5px] font-mono text-[9.5px] tracking-[0.12em] text-signal";
