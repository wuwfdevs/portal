import { describe, expect, it } from "vitest";
import { buildReportIdentifier, summarizeAffidavitLineItems } from "./affidavits";

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
    expect(summarizeAffidavitLineItems([])).toEqual({ totalLineItems: 0, airedAsScheduled: 0, otherOutcomes: 0 });
  });
});

describe("buildReportIdentifier", () => {
  it("has no version suffix the first time", () => {
    expect(buildReportIdentifier("WUWF-1234", "2026-08-01", "2026-08-31", 0)).toBe("WUWF-1234-2026-08-01-2026-08-31");
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
