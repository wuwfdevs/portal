import { describe, expect, it } from "vitest";
import {
  compareToolsForDashboard,
  grantRequiredForTool,
  isListedOnDashboard,
} from "./tool-access-rules";

describe("grantRequiredForTool", () => {
  it("requires a grant for an invite_only tool, which is every tool but Roadmap", () => {
    expect(grantRequiredForTool({ status: "available", default_access: "invite_only" })).toBe(true);
  });

  it("does not require a grant for an approved_staff tool", () => {
    expect(grantRequiredForTool({ status: "available", default_access: "approved_staff" })).toBe(
      false,
    );
  });

  it("still requires a grant for 'open', which nothing enforces yet", () => {
    expect(grantRequiredForTool({ status: "available", default_access: "open" })).toBe(true);
  });
});

describe("isListedOnDashboard", () => {
  it("excludes a proposed tool — it is an idea on the roadmap, not software", () => {
    expect(
      isListedOnDashboard({ status: "proposed", default_access: "invite_only", enabled: true }),
    ).toBe(false);
  });

  it("lists every other status when the tool is enabled", () => {
    for (const status of ["available", "in_development", "planned"] as const) {
      expect(isListedOnDashboard({ status, default_access: "invite_only", enabled: true })).toBe(
        true,
      );
    }
  });

  it("excludes a tool an administrator has disabled, whatever its status or access rule", () => {
    for (const status of ["available", "in_development", "planned", "proposed"] as const) {
      for (const default_access of ["invite_only", "approved_staff", "open"] as const) {
        expect(isListedOnDashboard({ status, default_access, enabled: false })).toBe(false);
      }
    }
  });
});

describe("compareToolsForDashboard", () => {
  it("sorts available tools ahead of in-development and planned ones", () => {
    const rows = [
      { status: "planned", sort_order: 0 },
      { status: "in_development", sort_order: 0 },
      { status: "available", sort_order: 0 },
    ] as const;
    const sorted = [...rows].sort(compareToolsForDashboard);
    expect(sorted.map((r) => r.status)).toEqual(["available", "in_development", "planned"]);
  });

  it("breaks ties within a status by sort_order", () => {
    const rows = [
      { status: "available", sort_order: 2 },
      { status: "available", sort_order: 1 },
    ] as const;
    const sorted = [...rows].sort(compareToolsForDashboard);
    expect(sorted.map((r) => r.sort_order)).toEqual([1, 2]);
  });

  it("never lets a high sort_order pull a planned tool ahead of an available one", () => {
    const rows = [
      { status: "planned", sort_order: 0 },
      { status: "available", sort_order: 99 },
    ] as const;
    const sorted = [...rows].sort(compareToolsForDashboard);
    expect(sorted.map((r) => r.status)).toEqual(["available", "planned"]);
  });
});
