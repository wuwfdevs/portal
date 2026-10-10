import { describe, expect, it } from "vitest";
import {
  cleanProposedTitle,
  composeExcerptName,
  parseExcerptName,
  suggestExcerptTitle,
} from "./excerpt-title";

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

describe("full excerpt names", () => {
  it("composes Story_Speaker_Quote and reads it back", () => {
    const name = composeExcerptName(
      "Hurricane Isaias",
      "Chip Simmons",
      "Second fatality from generator fumes",
    );
    expect(name).toBe("Hurricane Isaias_Chip Simmons_Second fatality from generator fumes");
    expect(parseExcerptName(name)).toEqual({
      story: "Hurricane Isaias",
      speaker: "Chip Simmons",
      quote: "Second fatality from generator fumes",
    });
  });

  it("falls back for a missing speaker or story and keeps underscores out of the parts", () => {
    expect(composeExcerptName("", null, "A quote")).toBe("Untitled_Unnamed_A quote");
    expect(composeExcerptName("Story_one", "Dr_X", "Quote")).toBe("Story one_Dr X_Quote");
  });

  it("is idempotent and leaves a quote-only title alone when reading", () => {
    const name = "Isaias_Chip Simmons_Generator fumes";
    expect(composeExcerptName("Other", "Someone", name)).toBe(name);
    expect(parseExcerptName("Generator fumes kill man")).toBeNull();
    expect(parseExcerptName("a_b")).toBeNull();
  });
});
