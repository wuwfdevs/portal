import { describe, expect, it } from "vitest";
import {
  affidavitFileName,
  buildAffidavitDocument,
  buildReportIdentifier,
  certificationSentence,
  endOfPreviousMonth,
  nextAffidavitPeriod,
  type AffidavitAiringInput,
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

function airing(overrides: Partial<AffidavitAiringInput> = {}): AffidavitAiringInput {
  return {
    broadcastEventId: "e1",
    outcome: "aired_as_scheduled",
    // 12:49:35 UTC in March is 7:49:35 AM CDT.
    airedAt: "2026-03-09T12:49:35Z",
    programName: "Morning Edition",
    copyLabel: "Message A",
    durationSeconds: 30,
    scheduleLineId: "mon",
    demandBucketId: "w1",
    makegoodForScheduledAt: null,
    ...overrides,
  };
}

const MARCH = {
  periodStart: "2026-03-01",
  periodEnd: "2026-03-31",
  underwriterName: "Autumn Beck Blackledge",
  mailingAddress: "c/o Southern Media\n  PO Box 15507\n\nPensacola, FL 32514",
  scheduleLines: [
    { id: "mon", label: "Mondays, Morning Edition", serviceLevel: "guaranteed" as const },
    { id: "bonus", label: "Run of schedule", serviceLevel: "bonus" as const },
  ],
  buckets: [
    {
      id: "w1",
      scheduleLineId: "mon",
      periodStart: "2026-03-09",
      periodEnd: "2026-03-15",
      quantityRequired: 1,
      status: "active" as const,
    },
    {
      id: "w2",
      scheduleLineId: "mon",
      periodStart: "2026-03-16",
      periodEnd: "2026-03-22",
      quantityRequired: 1,
      status: "active" as const,
    },
    // Runs past the affidavit's end — not summarized.
    {
      id: "w3",
      scheduleLineId: "mon",
      periodStart: "2026-03-30",
      periodEnd: "2026-04-05",
      quantityRequired: 1,
      status: "active" as const,
    },
    {
      id: "old",
      scheduleLineId: "mon",
      periodStart: "2026-03-02",
      periodEnd: "2026-03-08",
      quantityRequired: 1,
      status: "superseded" as const,
    },
  ],
};

describe("buildAffidavitDocument", () => {
  it("lists only aired credits, in air order, in station time", () => {
    const doc = buildAffidavitDocument({
      ...MARCH,
      airings: [
        airing({ broadcastEventId: "late", airedAt: "2026-03-16T12:49:35Z", demandBucketId: "w2" }),
        airing({ broadcastEventId: "missed", outcome: "missed" }),
        airing({ broadcastEventId: "early" }),
      ],
    });
    expect(doc.rows.map((row) => row.broadcastEventId)).toEqual(["early", "late"]);
    expect(doc.rows[0]).toMatchObject({
      date: "Mon, Mar 9, 2026",
      time: "7:49:35 AM",
      program: "Morning Edition",
      message: "Message A",
      note: null,
      length: null,
    });
    expect(doc.airedCount).toBe(2);
    expect(doc.certificationSentence).toBe(certificationSentence(2));
  });

  it("compares ordered with aired over schedule periods wholly inside the dates", () => {
    const doc = buildAffidavitDocument({
      ...MARCH,
      airings: [
        airing({ broadcastEventId: "a" }),
        airing({ broadcastEventId: "b", airedAt: "2026-03-30T12:49:35Z", demandBucketId: "w3" }),
      ],
    });
    expect(doc.summary).toEqual([
      {
        scheduleLineId: "mon",
        label: "Mondays, Morning Edition",
        bonus: false,
        ordered: 2,
        aired: 1,
      },
    ]);
    expect(doc.outsideSummaryCount).toBe(1);
  });

  it("names the credit a makegood replaces", () => {
    const doc = buildAffidavitDocument({
      ...MARCH,
      airings: [airing({ makegoodForScheduledAt: "2026-03-12T12:06:00Z" })],
    });
    expect(doc.rows[0]?.note).toBe("Makegood for Thu, Mar 12");
  });

  it("states one shared length in the heading, or each length when they differ", () => {
    const same = buildAffidavitDocument({ ...MARCH, airings: [airing()] });
    expect(same.lengthLabel).toBe("30-second announcements");
    const mixed = buildAffidavitDocument({
      ...MARCH,
      airings: [airing(), airing({ broadcastEventId: "e2", durationSeconds: 60 })],
    });
    expect(mixed.lengthLabel).toBeNull();
    expect(mixed.rows.map((row) => row.length)).toEqual(["0:30", "1:00"]);
  });

  it("prints the underwriter and each non-empty address line", () => {
    const doc = buildAffidavitDocument({ ...MARCH, airings: [] });
    expect(doc.recipientLines).toEqual([
      "Autumn Beck Blackledge",
      "c/o Southern Media",
      "PO Box 15507",
      "Pensacola, FL 32514",
    ]);
    expect(doc.periodLabel).toBe("March 1, 2026 – March 31, 2026");
    expect(doc.summary).toEqual([
      {
        scheduleLineId: "mon",
        label: "Mondays, Morning Edition",
        bonus: false,
        ordered: 2,
        aired: 0,
      },
    ]);
  });
});

describe("certificationSentence", () => {
  it("agrees in number", () => {
    expect(certificationSentence(1)).toContain("the 1 announcement listed above was broadcast");
    expect(certificationSentence(9)).toContain("the 9 announcements listed above were broadcast");
  });
});

describe("affidavitFileName", () => {
  it("keeps the report identifier readable and filesystem-safe", () => {
    expect(affidavitFileName("IO 12/3-2026-03-01-2026-03-31")).toBe(
      "WUWF affidavit IO-12-3-2026-03-01-2026-03-31.pdf",
    );
  });
});

describe("nextAffidavitPeriod", () => {
  const base = {
    status: "active",
    effectiveFrom: "2026-01-12",
    effectiveTo: "2026-07-12",
    coveredThrough: null,
    today: "2026-03-18",
  };

  it("runs from the contract's start through the end of last month", () => {
    expect(endOfPreviousMonth("2026-03-18")).toBe("2026-02-28");
    expect(nextAffidavitPeriod(base)).toEqual({ start: "2026-01-12", end: "2026-02-28" });
  });

  it("starts the day after the latest affidavit", () => {
    expect(nextAffidavitPeriod({ ...base, coveredThrough: "2026-01-31" })).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
    expect(nextAffidavitPeriod({ ...base, coveredThrough: "2026-02-28" })).toBeNull();
  });

  it("closes at the contract's end once it has passed", () => {
    expect(
      nextAffidavitPeriod({ ...base, effectiveTo: "2026-03-10", coveredThrough: "2026-02-28" }),
    ).toEqual({ start: "2026-03-01", end: "2026-03-10" });
  });

  it("is never due for a draft or a contract that hasn't reached a full month", () => {
    expect(nextAffidavitPeriod({ ...base, status: "draft" })).toBeNull();
    expect(nextAffidavitPeriod({ ...base, effectiveFrom: "2026-03-02" })).toBeNull();
  });
});
