import { describe, expect, it } from "vitest";
import {
  buildAffidavitMonth,
  countAffidavitStates,
  dueRangesToGenerate,
  defaultAffidavitMonth,
  isMonthKey,
  otherMonthsOwed,
  shiftMonth,
  signingQueue,
  type AffidavitInput,
} from "./affidavit-month";

const contract = (id: string, name: string, required = false) => ({
  id,
  underwriterName: name,
  affidavitRequired: required,
});
const beck = contract("c1", "Autumn Beck Blackledge");
const osteo = contract("c2", "OsteoStrong");
const newSouth = contract("c3", "New South Federal", true);

const affidavit = (
  id: string,
  c: typeof beck,
  status: "draft" | "certified",
  generatedAt: string,
  end = "2026-09-30",
): AffidavitInput<typeof beck> => ({
  id,
  contract: c,
  status,
  campaignPeriodStart: "2026-09-01",
  campaignPeriodEnd: end,
  generatedAt,
  certifiedAt: status === "certified" ? generatedAt : null,
  airedCount: 4,
});

describe("months", () => {
  it("opens on last month", () => {
    expect(defaultAffidavitMonth("2026-10-01")).toBe("2026-09");
    expect(defaultAffidavitMonth("2026-01-15")).toBe("2025-12");
  });
  it("shifts across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(shiftMonth("2026-09", 0)).toBe("2026-09");
  });
  it("recognises a month key", () => {
    expect(isMonthKey("2026-09")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-9")).toBe(false);
  });
});

describe("buildAffidavitMonth", () => {
  const due = [
    { contract: osteo, periodStart: "2026-09-01", periodEnd: "2026-09-30", airedCount: 12 },
    { contract: beck, periodStart: "2026-08-01", periodEnd: "2026-08-31", airedCount: 9 },
  ];
  const affidavits = [
    affidavit("a1", newSouth, "draft", "2026-10-01T12:00:00Z"),
    affidavit("a2", beck, "certified", "2026-10-01T09:00:00Z"),
    affidavit("a3", beck, "draft", "2026-10-02T09:00:00Z"),
    affidavit("a4", osteo, "certified", "2026-09-02T09:00:00Z", "2026-08-31"),
  ];
  const rows = buildAffidavitMonth("2026-09", due, affidavits);

  it("keeps only the month's rows: one per contract, newest affidavit first", () => {
    expect(rows.map((row) => [row.contract.id, row.state])).toEqual([
      ["c3", "sign"],
      ["c1", "sign"],
      ["c2", "generate"],
    ]);
    expect(rows[1]!.earlier.map((item) => item.id)).toEqual(["a2"]);
  });
  it("counts states and lists the signing queue in page order", () => {
    expect(countAffidavitStates(rows)).toEqual({ generate: 1, sign: 2, signed: 0 });
    expect(signingQueue(rows)).toEqual(["a1", "a3"]);
  });
  it("puts a certified newest affidavit in signed", () => {
    const august = buildAffidavitMonth("2026-08", due, affidavits);
    expect(august.map((row) => [row.contract.id, row.state])).toEqual([
      ["c1", "generate"],
      ["c2", "signed"],
    ]);
  });
  it("names the other months still owed", () => {
    expect(otherMonthsOwed("2026-09", due)).toEqual([{ month: "2026-08", count: 1 }]);
    expect(otherMonthsOwed("2026-08", due)).toEqual([{ month: "2026-09", count: 1 }]);
  });
});

describe("one row per contract", () => {
  it("merges a partial affidavit with the remainder still owed", () => {
    const partial = {
      ...affidavit("p1", osteo, "certified", "2026-10-01T09:00:00Z", "2026-09-15"),
    };
    const remainder = {
      contract: osteo,
      periodStart: "2026-09-16",
      periodEnd: "2026-09-30",
      airedCount: 6,
    };
    const rows = buildAffidavitMonth("2026-09", [remainder], [partial]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe("signed");
    expect(rows[0]!.due).toEqual([
      { periodStart: "2026-09-16", periodEnd: "2026-09-30", airedCount: 6 },
    ]);
    expect(countAffidavitStates(rows)).toEqual({ generate: 1, sign: 0, signed: 1 });
    expect(dueRangesToGenerate(rows)).toEqual([
      { contractId: "c2", periodStart: "2026-09-16", periodEnd: "2026-09-30", airedCount: 6 },
    ]);
  });

  it("keeps several ranges owed in one month on one generate row", () => {
    const rows = buildAffidavitMonth(
      "2026-09",
      [
        { contract: beck, periodStart: "2026-09-21", periodEnd: "2026-09-30", airedCount: 2 },
        { contract: beck, periodStart: "2026-09-01", periodEnd: "2026-09-09", airedCount: 3 },
      ],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe("generate");
    expect(rows[0]!.airedCount).toBe(5);
    expect(rows[0]!.due.map((range) => range.periodStart)).toEqual(["2026-09-01", "2026-09-21"]);
  });
});
