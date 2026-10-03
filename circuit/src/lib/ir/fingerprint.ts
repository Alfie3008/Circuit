/**
 * The canonical text of a program's rules, for fingerprinting: validated (so
 * defaults are filled the same way everywhere), without layout (positions,
 * block ids), with object keys sorted. Moving a block doesn't change it;
 * changing what the program does always does.
 */
import { parseProgram } from "./validate";

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      if (k === "position" || k === "id") continue;
      out[k] = canonical((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

export function canonicalRules(program: unknown): string {
  const parsed = parseProgram(program);
  return JSON.stringify(canonical(parsed.ok ? parsed.program : program));
}
