import { describe, expect, it } from "vitest";
import { normalizeRoleKey, parseRoleSet, singleRole } from "./role-keys";

describe("role helpers", () => {
  it("normalizes a stored value", () => {
    expect(normalizeRoleKey("  Curator ")).toBe("curator");
    expect(normalizeRoleKey(null)).toBe("");
  });

  it("keeps only the known roles, in the tool's order", () => {
    expect(
      parseRoleSet([" Traffic ", "program_director", "bogus"], ["program_director", "traffic"]),
    ).toEqual(["program_director", "traffic"]);
    expect(parseRoleSet(null, ["traffic"])).toEqual([]);
  });

  it("picks the elevated role only on an exact match", () => {
    expect(singleRole("Curator", "curator", "member")).toBe("curator");
    expect(singleRole("curators", "curator", "member")).toBe("member");
    expect(singleRole(null, "curator", "member")).toBe("member");
  });
});
