import { describe, expect, it } from "vitest";
import { isModelRole, visibleTabs } from "./nav";

const labels = (tabs: { label: string }[]) => tabs.map((t) => t.label);

describe("visibleTabs", () => {
  it("puts Rates under More for production staff and for a member with no role — never removes it", () => {
    for (const roles of [["production"], []] as const) {
      const { primary, more } = visibleTabs(roles);
      expect(labels(primary)).toEqual(["Dashboard", "Requests", "Calendar", "Partners"]);
      expect(labels(more)).toEqual(["Rates"]);
    }
  });

  it("shows Rates inline for finance, the director and the executive", () => {
    for (const role of ["finance", "director", "executive"] as const) {
      const { primary, more } = visibleTabs([role]);
      expect(labels(primary)).toContain("Rates");
      expect(more).toEqual([]);
    }
  });

  it("a production member who also holds a model role gets the inline tab", () => {
    expect(labels(visibleTabs(["production", "finance"]).primary)).toContain("Rates");
    expect(isModelRole(["production"])).toBe(false);
  });

  it("an administrator sees everything inline", () => {
    expect(labels(visibleTabs([], true).primary)).toContain("Rates");
  });
});
