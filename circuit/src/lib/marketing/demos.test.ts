import { describe, expect, it } from "vitest";
import { BLANK, DEBUG, DIARY, LEGO, LEGO_STEPS, TINY } from "./demos";

describe("marketing demos", () => {
  it("are valid programs (they'd throw on import otherwise)", () => {
    expect([LEGO, DIARY, DEBUG, TINY, BLANK].every((p) => p.scripts.length > 0)).toBe(true);
  });
  it("animate only blocks that exist", () => {
    const ids = JSON.stringify(LEGO);
    for (const s of LEGO_STEPS) for (const id of [...s.hidden, s.target].filter(Boolean)) expect(ids).toContain(`"id":"${id}"`);
  });
});
