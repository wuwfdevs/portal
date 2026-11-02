import { describe, expect, it } from "vitest";
import { getRoleCatalog, parseToolGrants, rolesStack, sameRoles } from "./tool-roles";

describe("getRoleCatalog", () => {
  it("returns editorial planning's role options in rank order", () => {
    const catalog = getRoleCatalog("editorial-planning");
    expect(catalog?.map((option) => option.value)).toEqual(["contributor", "reviewer", "editor"]);
    expect(catalog?.every((option) => option.label && option.description)).toBe(true);
  });

  it("returns null for tools with no distinct roles", () => {
    expect(getRoleCatalog("remote-interview")).toBeNull();
    expect(getRoleCatalog("audience-listening")).toBeNull();
    expect(getRoleCatalog("nonexistent-tool")).toBeNull();
  });
});

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

describe("Sourcework (key transcription)", () => {
  it("offers the stacking editor role", () => {
    expect(getRoleCatalog("transcription")?.map((role) => role.value)).toEqual(["editor"]);
    expect(rolesStack("transcription")).toBe(true);
  });
});

describe("rolesStack", () => {
  it("is true only for the broadcast tools", () => {
    expect(rolesStack("log")).toBe(true);
    expect(rolesStack("underwriting")).toBe(true);
    expect(rolesStack("editorial-planning")).toBe(false);
  });
});

describe("parseToolGrants", () => {
  it("reads stacked role checkboxes in stored order", () => {
    expect(
      parseToolGrants(
        form([
          ["tool_id", "a"],
          ["tool_roles_a", "traffic"],
          ["tool_roles_a", "program_director"],
          ["tool_roles_a", "Traffic"],
        ]),
      ),
    ).toEqual([{ toolId: "a", toolRoles: ["program_director", "traffic"] }]);
  });

  it("reads a dropdown role, and an empty one as no role", () => {
    expect(
      parseToolGrants(
        form([
          ["tool_id", "a"],
          ["tool_role_a", " Editor "],
          ["tool_id", "b"],
          ["tool_role_b", ""],
        ]),
      ),
    ).toEqual([
      { toolId: "a", toolRoles: ["editor"] },
      { toolId: "b", toolRoles: [] },
    ]);
  });

  it("ignores roles for a tool that isn't checked", () => {
    expect(parseToolGrants(form([["tool_roles_a", "traffic"]]))).toEqual([]);
  });
});

describe("sameRoles", () => {
  it("compares stored lists", () => {
    expect(sameRoles(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameRoles(["a"], ["a", "b"])).toBe(false);
  });
});
