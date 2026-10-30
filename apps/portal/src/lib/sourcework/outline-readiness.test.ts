import { describe, expect, it } from "vitest";
import { outlineReadiness } from "./outline-readiness";

describe("outlineReadiness", () => {
  it("is ready with findings and excerpts", () => {
    expect(outlineReadiness({ excerpts: 3, findings: 10, waiting: 0 }).level).toBe("ready");
  });
  it("warns, but allows a run, when there are findings and no excerpts", () => {
    const result = outlineReadiness({ excerpts: 0, findings: 4, waiting: 6 });
    expect(result).toMatchObject({ level: "no_excerpts", canRun: true });
    expect("message" in result && result.message).toContain("6 suggestions waiting");
  });
  it("blocks when there is nothing to work from", () => {
    expect(outlineReadiness({ excerpts: 0, findings: 0, waiting: 0 })).toMatchObject({
      level: "nothing",
      canRun: false,
    });
  });
});
