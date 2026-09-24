import { describe, expect, it } from "vitest";
import { countWords, estimateReadSeconds, READ_WORDS_PER_MINUTE } from "./read-time";

describe("estimateReadSeconds", () => {
  it("returns null for a missing or blank script", () => {
    expect(estimateReadSeconds(null)).toBeNull();
    expect(estimateReadSeconds(undefined)).toBeNull();
    expect(estimateReadSeconds("  \n ")).toBeNull();
  });

  it("scales with word count at the configured pace", () => {
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    expect(estimateReadSeconds(words(READ_WORDS_PER_MINUTE))).toBe(60);
    expect(estimateReadSeconds(words(40))).toBe(15);
    expect(estimateReadSeconds(words(69))).toBe(26);
  });

  it("never estimates below one second", () => {
    expect(estimateReadSeconds("Hi")).toBe(1);
  });

  it("counts each spelled-out letter as a word, and ignores layout whitespace", () => {
    expect(countWords("Support for WUWF comes from F P L…\n  Working for you.")).toBe(11);
  });
});
