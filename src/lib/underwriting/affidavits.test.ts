import { describe, expect, it } from "vitest";
import {
  buildReportIdentifier,
  defaultAffidavitPeriod,
  newAffidavitHref,
  summarizeAffidavitLineItems,
} from "./affidavits";

describe("summarizeAffidavitLineItems", () => {
  it("counts aired-as-scheduled separately from every other outcome", () => {
    expect(
      summarizeAffidavitLineItems([
        { outcome: "aired_as_scheduled" },
        { outcome: "aired_as_scheduled" },
        { outcome: "missed" },
        { outcome: "skipped" },
      ]),
    ).toEqual({ totalLineItems: 4, airedAsScheduled: 2, otherOutcomes: 2 });
  });

  it("handles an empty evidence set", () => {
    expect(summarizeAffidavitLineItems([])).toEqual({
      totalLineItems: 0,
      airedAsScheduled: 0,
      otherOutcomes: 0,
    });
  });
});

describe("buildReportIdentifier", () => {
  it("has no version suffix the first time", () => {
    expect(buildReportIdentifier("WUWF-1234", "2026-08-01", "2026-08-31", 0)).toBe(
      "WUWF-1234-2026-08-01-2026-08-31",
    );
  });

  it("gets a version suffix on regeneration", () => {
    expect(buildReportIdentifier("WUWF-1234", "2026-08-01", "2026-08-31", 1)).toBe(
      "WUWF-1234-2026-08-01-2026-08-31-v2",
    );
    expect(buildReportIdentifier("WUWF-1234", "2026-08-01", "2026-08-31", 2)).toBe(
      "WUWF-1234-2026-08-01-2026-08-31-v3",
    );
  });
});

describe("defaultAffidavitPeriod", () => {
  it("runs from the contract's start through today while it is running", () => {
    expect(defaultAffidavitPeriod("2026-03-01", "2026-12-31", "2026-09-28")).toEqual({
      start: "2026-03-01",
      end: "2026-09-28",
    });
  });

  it("stops at the contract's end once it has ended", () => {
    expect(defaultAffidavitPeriod("2026-01-01", "2026-06-30", "2026-09-28")).toEqual({
      start: "2026-01-01",
      end: "2026-06-30",
    });
  });

  it("runs through today for an open-ended contract", () => {
    expect(defaultAffidavitPeriod("2026-01-01", null, "2026-09-28")).toEqual({
      start: "2026-01-01",
      end: "2026-09-28",
    });
  });

  it("offers the full run for a contract that hasn't started", () => {
    expect(defaultAffidavitPeriod("2026-10-01", "2026-12-31", "2026-09-28")).toEqual({
      start: "2026-10-01",
      end: "2026-12-31",
    });
    expect(defaultAffidavitPeriod("2026-10-01", null, "2026-09-28")).toEqual({
      start: "2026-10-01",
      end: "2026-10-01",
    });
  });
});

describe("newAffidavitHref", () => {
  it("carries only the fields given", () => {
    expect(newAffidavitHref({})).toBe("/underwriting/affidavits/new");
    expect(newAffidavitHref({ contractId: "abc" })).toBe(
      "/underwriting/affidavits/new?contract=abc",
    );
    expect(newAffidavitHref({ contractId: "abc", start: "2026-01-01", end: "2026-06-30" })).toBe(
      "/underwriting/affidavits/new?contract=abc&start=2026-01-01&end=2026-06-30",
    );
  });
});
