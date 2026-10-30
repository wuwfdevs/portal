import { describe, expect, it } from "vitest";
import { summarizeToolsUsed } from "./tools-used";

describe("summarizeToolsUsed", () => {
  it("lists tools in first-use order and counts repeats", () => {
    expect(
      summarizeToolsUsed(["read piece", "replace narration", "read piece", "replace narration"]),
    ).toBe("read piece (2) · replace narration (2)");
  });

  it("is empty for a turn that used nothing", () => {
    expect(summarizeToolsUsed([])).toBe("");
  });
});
