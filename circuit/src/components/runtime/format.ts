import type { RuntimeState } from "@/lib/runtime/state";
import { isRef, toText, type Ref, type Value } from "@/lib/runtime/values";

/** Display text for a value, resolving refs to names. */
export function show(v: Value | undefined, state: RuntimeState): string {
  return toText(v, (r: Ref) => {
    if (r.$ref === "agent") return state.agents.find((a) => a.id === r.id)?.name ?? "(removed agent)";
    if (r.$ref === "entity") return state.entities.find((e) => e.id === r.id)?.name ?? "(deleted)";
    if (r.$ref === "bounty") return state.bounties.find((b) => b.id === r.id)?.title ?? "(bounty)";
    return "submission";
  });
}

export const kindOf = (v: Value | undefined) =>
  isRef(v) ? v.$ref : Array.isArray(v) ? "list" : v === null || v === undefined ? "empty" : typeof v === "object" ? "object" : typeof v;

export const clock = (t: number) => new Date(t).toTimeString().slice(0, 8);
export const runNo = (n: number) => `#${String(n).padStart(4, "0")}`;
export const num = (n: number, places = 4) => String(Math.round(n * 10 ** places) / 10 ** places);

/** ASCII portraits from the design, keyed by species. */
const ART: Record<string, string> = {
  penguin: "  (o>\n  //\\\n  V_/_",
  otter: " ,-~-.\n( o o )\n  \\w/",
  raccoon: " /\\_/\\\n (@.@)\n  > ^<",
  capybara: "  ____\n (o   \\_\n  \\____/",
  owl: " {o,o}\n |)__)\n  \" \"",
  axolotl: "\\(o-o)/\n  ( )\n  ^ ^",
  fox: " /\\ /\\\n( o.o )\n  \\v/",
  hedgehog: " ,////,\n(o   .)>\n  ''''",
  cat: " /\\_/\\\n( o.o )\n > ^ <",
  frog: "  @..@\n (----)\n( >__< )",
  dog: " /^ ^\\\n/ 0 0 \\\nV\\ Y /V",
};
const GENERIC = "  .-.\n (o o)\n  |=|";

export const artFor = (species: string) => ART[species.toLowerCase().trim()] ?? GENERIC;
