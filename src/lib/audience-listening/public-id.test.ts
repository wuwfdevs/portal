import { describe, expect, it } from "vitest";
import { generatePublicId, isValidPublicId, PUBLIC_ID_LENGTH } from "./public-id";

describe("generatePublicId", () => {
  it("produces ids the CHECK constraint and the route both accept", () => {
    for (let i = 0; i < 200; i += 1) {
      const id = generatePublicId();
      expect(id).toHaveLength(PUBLIC_ID_LENGTH);
      expect(isValidPublicId(id)).toBe(true);
    }
  });

  it("omits the characters that get misread in a printed URL", () => {
    const sample = Array.from({ length: 200 }, generatePublicId).join("");
    for (const confusable of ["l", "o", "0", "1"]) {
      expect(sample).not.toContain(confusable);
    }
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 500 }, generatePublicId));
    expect(ids.size).toBe(500);
  });
});

describe("isValidPublicId", () => {
  it("accepts a well-formed id", () => {
    expect(isValidPublicId("abcdefgh23456789")).toBe(true);
  });

  it("rejects anything the column could not be holding", () => {
    expect(isValidPublicId("")).toBe(false);
    expect(isValidPublicId("tooshort")).toBe(false);
    expect(isValidPublicId("abcdefgh234567890")).toBe(false); // one too long
    expect(isValidPublicId("ABCDEFGH23456789")).toBe(false); // uppercase
    expect(isValidPublicId("abcdefgh-3456789")).toBe(false); // punctuation
    expect(isValidPublicId("../../../etc/pas")).toBe(false); // path traversal shape
  });
});
