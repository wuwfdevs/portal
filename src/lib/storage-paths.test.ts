import { describe, expect, it } from "vitest";
import { pathIsUnder } from "./storage-paths";

describe("pathIsUnder", () => {
  it("accepts objects inside the entity's folder", () => {
    expect(pathIsUnder("abc", "abc/agreement.pdf")).toBe(true);
    expect(pathIsUnder("abc", "abc/sub/file.png")).toBe(true);
  });

  it("refuses another entity's folder and look-alikes", () => {
    expect(pathIsUnder("abc", "abd/agreement.pdf")).toBe(false);
    expect(pathIsUnder("abc", "abcd/agreement.pdf")).toBe(false);
    expect(pathIsUnder("abc", "abc")).toBe(false);
    expect(pathIsUnder("abc", "abc/")).toBe(false);
  });

  it("refuses traversal and malformed prefixes", () => {
    expect(pathIsUnder("abc", "abc/../xyz/file.pdf")).toBe(false);
    expect(pathIsUnder("abc", "abc/./file.pdf")).toBe(false);
    expect(pathIsUnder("abc", "abc\\..\\x")).toBe(false);
    expect(pathIsUnder("", "/x")).toBe(false);
    expect(pathIsUnder("a/b", "a/b/c")).toBe(false);
  });
});
