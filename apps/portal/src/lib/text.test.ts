import { describe, expect, it } from "vitest";
import { collapseWhitespace, countWords, slugify, truncate } from "./text";

describe("collapseWhitespace and countWords", () => {
  it("collapses runs and trims", () => {
    expect(collapseWhitespace("  a \n\t b  ")).toBe("a b");
  });
  it("counts words", () => {
    expect(countWords("  one two\nthree ")).toBe(3);
    expect(countWords("   ")).toBe(0);
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("exactly10!", 10)).toBe("exactly10!");
  });
  it("never exceeds max, ellipsis included, and drops trailing space", () => {
    expect(truncate("hello wonderful world", 10)).toBe("hello won…");
    expect(truncate("hello wonderful world", 10).length).toBeLessThanOrEqual(10);
    expect(truncate("hello  there", 7)).toBe("hello…");
  });
});

describe("slugify", () => {
  it("folds accents and ampersands", () => {
    expect(slugify("Café R&D Update!")).toBe("cafe-r-and-d-update");
  });
  it("caps without a trailing hyphen and falls back", () => {
    expect(slugify("one two three", { max: 4 })).toBe("one");
    expect(slugify("!!!", { fallback: "untitled" })).toBe("untitled");
    expect(slugify("!!!")).toBe("");
  });
});
