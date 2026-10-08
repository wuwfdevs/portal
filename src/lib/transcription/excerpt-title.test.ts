import { describe, expect, it } from "vitest";
import { suggestExcerptTitle } from "./excerpt-title";

describe("suggestExcerptTitle", () => {
  it("takes the first words and capitalizes", () => {
    expect(suggestExcerptTitle("two lanes stay open through construction and then some more")).toBe(
      "Two lanes stay open through construction and then",
    );
  });

  it("drops trailing punctuation left by the cut", () => {
    expect(suggestExcerptTitle("For the first year, honestly, not much.", 4)).toBe(
      "For the first year",
    );
    expect(suggestExcerptTitle("Honestly, not much.")).toBe("Honestly, not much");
  });

  it("is empty for nothing", () => {
    expect(suggestExcerptTitle("   ")).toBe("");
  });
});
