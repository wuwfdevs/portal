import { describe, expect, it } from "vitest";
import { parseUnderwritingRoles, ROLE_OPTIONS } from "./roles";

describe("parseUnderwritingRoles", () => {
  it("reads each role, however it was capitalized or padded", () => {
    expect(parseUnderwritingRoles(["  Manager "])).toEqual(["manager"]);
    expect(parseUnderwritingRoles(["production", "MANAGER"])).toEqual(["manager", "production"]);
  });

  it("treats no grant, an empty list, and unrecognized roles as ordinary staff", () => {
    expect(parseUnderwritingRoles(null)).toEqual([]);
    expect(parseUnderwritingRoles([])).toEqual([]);
    expect(parseUnderwritingRoles(["traffic"])).toEqual([]);
  });
});

describe("ROLE_OPTIONS", () => {
  it("offers exactly the roles this tool interprets", () => {
    expect(ROLE_OPTIONS.map((option) => option.value)).toEqual(["manager", "production"]);
  });
});
