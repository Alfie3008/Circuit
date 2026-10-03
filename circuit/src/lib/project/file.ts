/**
 * `.circuit.json` — the portable project file. It carries the program as
 * Circuit IR, so files written by hand or by AI load through the same validator.
 */
import { z } from "zod";
import { parseProgram, plainIssues, type Program } from "@/lib/ir";

export const FILE_EXTENSION = ".circuit.json";

const Envelope = z.object({
  format: z.literal("circuit"),
  version: z.literal(1),
  name: z.string().max(120).optional(),
  program: z.unknown(),
  setup: z.unknown().optional(),
});

export function serializeProjectFile(name: string, program: Program, setup?: unknown): string {
  return JSON.stringify({ format: "circuit", version: 1, name, exportedAt: new Date().toISOString(), program, setup }, null, 2);
}

export type ReadFileResult = { ok: true; name: string; program: Program; setup?: unknown } | { ok: false; error: string };

export function readProjectFile(text: string, fallbackName: string): ReadFileResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  const env = Envelope.safeParse(json);
  if (!env.success) return { ok: false, error: "This isn't a CIRCUIT project file (expected format: \"circuit\", version: 1)." };
  const parsed = parseProgram(env.data.program);
  if (!parsed.ok) return { ok: false, error: `The program in this file has a problem, so it wasn't opened:\n${plainIssues(env.data.program, parsed.issues)}` };
  return { ok: true, name: env.data.name?.trim() || fallbackName, program: parsed.program, setup: env.data.setup };
}

export const fileNameFor = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project"}${FILE_EXTENSION}`;
