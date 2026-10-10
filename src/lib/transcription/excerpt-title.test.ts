import { describe, expect, it } from "vitest";
import { cleanProposedTitle, suggestExcerptTitle } from "./excerpt-title";

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

describe("cleanProposedTitle", () => {
  const fallback = "So I just want to give a quick";

  it("tidies a proposed title", () => {
    expect(
      cleanProposedTitle('{"title":"  “second fatality from generator fumes.”  "}', fallback),
    ).toBe("Second fatality from generator fumes");
  });

  it("keeps to nine words and 80 characters", () => {
    const long = cleanProposedTitle(
      JSON.stringify({ title: "one two three four five six seven eight nine ten eleven" }),
      fallback,
    );
    expect(long).toBe("One two three four five six seven eight nine");
    const wide = cleanProposedTitle(
      JSON.stringify({ title: "extraordinarily ".repeat(8).trim() }),
      fallback,
    );
    expect(wide.length).toBeLessThanOrEqual(80);
    expect(wide.endsWith("-")).toBe(false);
  });

  it("falls back on anything unusable", () => {
    expect(cleanProposedTitle("not json", fallback)).toBe(fallback);
    expect(cleanProposedTitle('{"title":""}', fallback)).toBe(fallback);
    expect(cleanProposedTitle('{"title":"...!"}', fallback)).toBe(fallback);
    expect(cleanProposedTitle('{"name":"x"}', fallback)).toBe(fallback);
    expect(cleanProposedTitle('{"title":42}', fallback)).toBe(fallback);
  });
});
