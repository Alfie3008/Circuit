/** Sample programs for the Modules page: a few of each module's real blocks, drawn from their defaults. */
import { BLOCKS } from "@/lib/blocks";
import type { ModuleId } from "@/lib/blocks/types";
import { parseProgram, type Program } from "@/lib/ir";

export function moduleSample(id: ModuleId): Program {
  const mine = BLOCKS.filter((b) => b.module === id);
  const hats = mine.filter((b) => b.shape === "hat").slice(0, 2);
  const actions = mine.filter((b) => b.shape === "statement").slice(0, hats.length ? 2 : 3);
  const values = mine.filter((b) => b.shape === "reporter" || b.shape === "boolean").slice(0, 1);
  const r = parseProgram({
    version: 1,
    scripts: hats.map((b) => ({ event: { type: b.ir }, body: [] })),
    loose: [...actions.map((b) => ({ body: [{ type: b.ir }] })), ...values.map((b) => ({ expr: { type: b.ir } }))],
  });
  return r.ok ? r.program : { version: 1, variables: [], scripts: [], loose: [] };
}

export const MODULE_ART: Record<string, string> = {
  core: " if ── then\n  │    └─ repeat\n  └─ else",
  solana: "  .--.     .--.\n ( SOL )--( W  )\n  '--'     '--'",
  ai: " > prompt_\n > think ...\n > answer #",
  browser: " .-------------.\n |o o https://_|\n |  #####  ..  |\n '-------------'",
  website: " .  o   .   *\n    *  .  o\n  o   .  *   .",
  finance: "  .--------.\n  | 0.03 ◎ |\n  '--------'  sim",
  bounties: " [ task ]\n     |\n (submit) x14\n     |\n [reward]",
  social: " POST ----> [  ]\n [  ] <---- 200",
};
