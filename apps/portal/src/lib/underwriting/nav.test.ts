import { describe, expect, it } from "vitest";
import { trafficSection, trafficSubItems, trafficTabs, type TrafficNavCounts } from "./nav";

const NONE: TrafficNavCounts = { exceptionsNeedingDecision: 0, affidavitsAwaitingSignature: 0 };

describe("trafficSection", () => {
  it.each([
    ["/underwriting", "dashboard"],
    ["/underwriting/contracts", "contracts"],
    ["/underwriting/contracts/abc/lines/def/edit", "contracts"],
    ["/underwriting/exceptions", "attention"],
    ["/underwriting/exceptions/abc", "attention"],
    ["/underwriting/affidavits", "attention"],
    ["/underwriting/underwriters", "library"],
    ["/underwriting/underwriters/industries", "library"],
    ["/underwriting/copy/new", "library"],
    ["/underwriting/setup", "setup"],
    ["/underwriting/setup/migration/copy", "setup"],
  ] as const)("%s is in %s", (pathname, section) => {
    expect(trafficSection(pathname)).toBe(section);
  });

  it("does not mistake a longer name for a section", () => {
    expect(trafficSection("/underwriting/copyright")).toBe("dashboard");
  });
});

describe("trafficTabs", () => {
  it("is five tabs with Setup set apart at the end", () => {
    const tabs = trafficTabs(NONE);
    expect(tabs.map((tab) => tab.label)).toEqual([
      "Dashboard",
      "Contracts",
      "Needs attention",
      "Library",
      "Setup",
    ]);
    expect(tabs.filter((tab) => tab.end).map((tab) => tab.label)).toEqual(["Setup"]);
  });

  it("badges Needs attention with decisions plus unsigned affidavits, and nothing else", () => {
    const tabs = trafficTabs({ exceptionsNeedingDecision: 3, affidavitsAwaitingSignature: 2 });
    expect(tabs.map((tab) => tab.badge)).toEqual([0, 0, 5, 0, 0]);
  });
});

describe("trafficSubItems", () => {
  it("has no second row for a single-page tab", () => {
    expect(trafficSubItems("dashboard", "/underwriting", NONE)).toEqual([]);
    expect(trafficSubItems("contracts", "/underwriting/contracts", NONE)).toEqual([]);
  });

  it("lights the page inside Needs attention, with each page's own count", () => {
    const items = trafficSubItems("attention", "/underwriting/affidavits", {
      exceptionsNeedingDecision: 3,
      affidavitsAwaitingSignature: 2,
    });
    expect(items.map((item) => [item.label, item.active, item.count])).toEqual([
      ["Exceptions", false, 3],
      ["Affidavits", true, 2],
    ]);
  });

  it("lights Overview only on the Setup page itself", () => {
    const at = (pathname: string) =>
      trafficSubItems("setup", pathname, NONE)
        .filter((item) => item.active)
        .map((item) => item.label);
    expect(at("/underwriting/setup")).toEqual(["Overview"]);
    expect(at("/underwriting/setup/pools")).toEqual(["Pools"]);
    expect(at("/underwriting/setup/migration/copy")).toEqual(["Migration"]);
  });
});
