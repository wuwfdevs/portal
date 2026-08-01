import { describe, expect, it } from "vitest";
import { normalizeToolRole, ROLE_OPTIONS } from "./roles";

describe("normalizeToolRole", () => {
  it("reads a curator grant, however it was capitalized or padded", () => {
    expect(normalizeToolRole("curator")).toBe("curator");
    expect(normalizeToolRole("Curator")).toBe("curator");
    expect(normalizeToolRole("  CURATOR  ")).toBe("curator");
  });

  it("treats no grant, an empty grant, and an unrecognized one as an ordinary member", () => {
    expect(normalizeToolRole(null)).toBe("member");
    expect(normalizeToolRole("")).toBe("member");
    expect(normalizeToolRole("editor")).toBe("member");
  });
});

describe("ROLE_OPTIONS", () => {
  it("offers exactly the two roles this tool interprets", () => {
    expect(ROLE_OPTIONS.map((option) => option.value)).toEqual(["member", "curator"]);
  });
});
