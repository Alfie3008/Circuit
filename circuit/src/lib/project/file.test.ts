import { describe, expect, it } from "vitest";
import { parseProgram } from "@/lib/ir";
import { fileNameFor, readProjectFile, serializeProjectFile } from "./file";

describe(".circuit.json files", () => {
  const program = (() => {
    const r = parseProgram({ scripts: [{ event: { type: "button" }, body: [{ type: "notify", message: "hi" }] }] });
    if (!r.ok) throw new Error("fixture invalid");
    return r.program;
  })();

  it("round-trips a program through export and import", () => {
    const r = readProjectFile(serializeProjectFile("My Crew", program), "fallback");
    expect(r).toEqual({ ok: true, name: "My Crew", program });
  });

  it("rejects non-JSON, foreign JSON and invalid programs with readable errors", () => {
    expect(readProjectFile("not json", "x")).toMatchObject({ ok: false, error: expect.stringContaining("valid JSON") });
    expect(readProjectFile('{"hello":1}', "x")).toMatchObject({ ok: false, error: expect.stringContaining("CIRCUIT project") });
    const bad = JSON.stringify({ format: "circuit", version: 1, program: { scripts: [{ event: { type: "nope" } }] } });
    expect(readProjectFile(bad, "x")).toMatchObject({ ok: false, error: expect.stringContaining('"nope" is not a CIRCUIT block') });
  });

  it("uses the file name when the file has no project name", () => {
    const r = readProjectFile(JSON.stringify({ format: "circuit", version: 1, program: {} }), "from-file");
    expect(r).toMatchObject({ ok: true, name: "from-file" });
  });

  it("makes safe file names", () => {
    expect(fileNameFor("Living Crew: v2!")).toBe("living-crew-v2.circuit.json");
    expect(fileNameFor("***")).toBe("project.circuit.json");
  });
});
