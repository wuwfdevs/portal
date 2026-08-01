import { describe, expect, it } from "vitest";
import { grantRequiredForTool, isListedOnDashboard } from "./tool-access-rules";

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
    expect(isListedOnDashboard({ status: "proposed", default_access: "invite_only" })).toBe(false);
  });

  it("lists every other status", () => {
    for (const status of ["available", "in_development", "planned"] as const) {
      expect(isListedOnDashboard({ status, default_access: "invite_only" })).toBe(true);
    }
  });
});
