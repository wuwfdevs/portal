import { describe, expect, it } from "vitest";
import { normalizeToolRole, ROLE_OPTIONS } from "./roles";

describe("normalizeToolRole", () => {
  it("reads an editor grant, however it was capitalized or padded", () => {
    expect(normalizeToolRole("editor")).toBe("editor");
    expect(normalizeToolRole("  Editor ")).toBe("editor");
  });

  it("treats no grant and any other role as a reader", () => {
    expect(normalizeToolRole(null)).toBe("reader");
    expect(normalizeToolRole("")).toBe("reader");
    expect(normalizeToolRole("curator")).toBe("reader");
  });
});

describe("ROLE_OPTIONS", () => {
  it("offers exactly the two roles this tool interprets", () => {
    expect(ROLE_OPTIONS.map((option) => option.value)).toEqual(["reader", "editor"]);
  });
});
