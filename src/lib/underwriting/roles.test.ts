import { describe, expect, it } from "vitest";
import { normalizeToolRole, ROLE_OPTIONS } from "./roles";

describe("normalizeToolRole", () => {
  it("reads a manager grant, however it was capitalized or padded", () => {
    expect(normalizeToolRole("manager")).toBe("manager");
    expect(normalizeToolRole("Manager")).toBe("manager");
    expect(normalizeToolRole("  MANAGER  ")).toBe("manager");
  });

  it("treats no grant, an empty grant, and an unrecognized one as an ordinary member", () => {
    expect(normalizeToolRole(null)).toBe("member");
    expect(normalizeToolRole("")).toBe("member");
    expect(normalizeToolRole("traffic")).toBe("member");
  });
});

describe("ROLE_OPTIONS", () => {
  it("offers exactly the two roles this tool interprets", () => {
    expect(ROLE_OPTIONS.map((option) => option.value)).toEqual(["member", "manager"]);
  });
});
