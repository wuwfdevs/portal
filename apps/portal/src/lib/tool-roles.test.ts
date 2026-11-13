import { describe, expect, it } from "vitest";
import { getRoleCatalog, getRoleSpec, parseToolGrants, rolesStack, sameRoles } from "./tool-roles";

describe("getRoleCatalog", () => {
  it("returns editorial planning's role options in rank order", () => {
    const catalog = getRoleCatalog("editorial-planning");
    expect(catalog?.map((option) => option.value)).toEqual(["contributor", "reviewer", "editor"]);
    expect(catalog?.every((option) => option.label && option.description)).toBe(true);
  });

  it("returns null for tools with no distinct roles", () => {
    expect(getRoleCatalog("remote-interview")).toBeNull();
    expect(getRoleCatalog("nonexistent-tool")).toBeNull();
  });
});

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

describe("Audience Listening", () => {
  it("offers the stacking coordinator role, which approves public events for listing", () => {
    expect(getRoleCatalog("audience-listening")?.map((role) => role.value)).toEqual(["coordinator"]);
    expect(rolesStack("audience-listening")).toBe(true);
  });
});

describe("Sourcework (key transcription)", () => {
  it("offers the stacking editor role", () => {
    expect(getRoleCatalog("transcription")?.map((role) => role.value)).toEqual(["editor"]);
    expect(rolesStack("transcription")).toBe(true);
  });
});

describe("rolesStack", () => {
  it("is false only for the ranked tool and tools with no roles", () => {
    expect(rolesStack("log")).toBe(true);
    expect(rolesStack("underwriting")).toBe(true);
    expect(rolesStack("roadmap")).toBe(true);
    expect(rolesStack("editorial-planning")).toBe(false);
    expect(rolesStack("remote-interview")).toBe(false);
  });
});

describe("tools open to everyone", () => {
  it("offer only the elevation, since base access is not a grant", () => {
    expect(getRoleCatalog("roadmap")?.map((role) => role.value)).toEqual(["curator"]);
    expect(getRoleCatalog("resources")?.map((role) => role.value)).toEqual(["editor"]);
  });
});

describe("Academic Partnerships", () => {
  it("can grant the coordinator role", () => {
    expect(getRoleCatalog("academic-partnerships")?.map((role) => role.value)).toEqual([
      "coordinator",
    ]);
  });
});

describe("getRoleSpec", () => {
  it("marks Editorial Planning ranked and the broadcast tools stacking", () => {
    expect(getRoleSpec("editorial-planning")?.kind).toBe("ranked");
    expect(getRoleSpec("log")?.kind).toBe("stacking");
    expect(getRoleSpec("remote-interview")).toBeNull();
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

  describe("a tool open to every active user", () => {
    const openToolIds = new Set(["open"]);

    it("is granted exactly when a role is chosen", () => {
      expect(parseToolGrants(form([["tool_roles_open", "curator"]]), { openToolIds })).toEqual([
        { toolId: "open", toolRoles: ["curator"] },
      ]);
    });

    it("has no grant when no role is chosen", () => {
      expect(parseToolGrants(form([]), { openToolIds })).toEqual([]);
    });

    it("keeps a checked invite-only tool next to it", () => {
      expect(
        parseToolGrants(
          form([
            ["tool_id", "a"],
            ["tool_roles_open", "curator"],
          ]),
          { openToolIds },
        ),
      ).toEqual([
        { toolId: "a", toolRoles: [] },
        { toolId: "open", toolRoles: ["curator"] },
      ]);
    });

    it("does not treat a tool that is not open as one", () => {
      expect(parseToolGrants(form([["tool_roles_closed", "curator"]]), { openToolIds })).toEqual(
        [],
      );
    });
  });
});

describe("sameRoles", () => {
  it("compares stored lists", () => {
    expect(sameRoles(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameRoles(["a"], ["a", "b"])).toBe(false);
  });
});
