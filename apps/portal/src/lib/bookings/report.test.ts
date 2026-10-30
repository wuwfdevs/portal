import { describe, expect, it } from "vitest";
import type { LineEconomics } from "./economics";
import { inTerm, termReport, type ReportProject } from "./report";

function webcastLine(amount: number, cost = { labor: 372.9375, resource: 404.7 }): LineEconomics {
  return {
    lineId: "l",
    label: "Basic event webcast (event)",
    kind: "package",
    unitLabel: "event",
    quantity: 1,
    laborCost: cost.labor,
    resourceCost: cost.resource,
    directCost: 0,
    amount,
  };
}

function project(overrides: Partial<ReportProject> & { id: string }): ReportProject {
  return {
    partner_id: "libraries",
    partner_name: "UWF Libraries",
    priced_as: "strategic",
    stage: "booked",
    closed: false,
    qualifies_strategic: true,
    reserve_depleted: false,
    full_economic_cost: 777.6375,
    partner_recovery: 575,
    wuwf_contribution: 202.6375,
    external_margin: 0,
    external_assessment: 0,
    lines: [webcastLine(575)],
    ...overrides,
  };
}

const STRATEGIC = project({ id: "s" });
const INCREMENTAL = project({
  id: "i",
  partner_id: "business",
  partner_name: "College of Business",
  priced_as: "incremental",
  qualifies_strategic: false,
  partner_recovery: 800,
  wuwf_contribution: 0,
  lines: [webcastLine(800)],
});
const EXTERNAL = project({
  id: "x",
  partner_id: "chamber",
  partner_name: "Chamber of Commerce",
  priced_as: "external",
  qualifies_strategic: null,
  partner_recovery: 1150,
  wuwf_contribution: 0,
  external_margin: 295.1975,
  external_assessment: 77.165,
  lines: [webcastLine(1150)],
});

describe("termReport", () => {
  const report = termReport([STRATEGIC, INCREMENTAL, EXTERNAL], "priced");

  it("totals full cost, recovery and contribution, with margin and assessment alongside", () => {
    expect(report.totals).toEqual({
      count: 3,
      fullCost: 2332.9125,
      recovery: 2525,
      contribution: 202.6375,
      margin: 295.1975,
      assessment: 77.165,
    });
  });

  it("by partner, most contribution first", () => {
    expect(report.byPartner.map((p) => [p.name, p.contribution])).toEqual([
      ["UWF Libraries", 202.6375],
      ["Chamber of Commerce", 0],
      ["College of Business", 0],
    ]);
  });

  it("by pricing treatment", () => {
    expect(report.byTreatment.strategic).toMatchObject({ count: 1, contribution: 202.6375, recovery: 575 });
    expect(report.byTreatment.incremental).toMatchObject({ count: 1, contribution: 0, recovery: 800 });
    expect(report.byTreatment.external).toMatchObject({ count: 1, margin: 295.1975, assessment: 77.165 });
  });

  it("tests the legacy $500 against modeled cost, per event", () => {
    expect(report.webcast).toEqual({
      events: 3,
      costPerEvent: 777.6375,
      priceChargedPerEvent: 841.666667,
      legacyPrice: 500,
      priceVersusLegacy: 341.666667,
      costVersusLegacy: 277.6375,
    });
  });

  it("counts qualifying work by the judgment, even when it was priced at the university rate for want of reserve", () => {
    const depleted = project({
      id: "d",
      priced_as: "incremental",
      reserve_depleted: true,
      partner_recovery: 800,
      wuwf_contribution: 0,
    });
    const r = termReport([STRATEGIC, depleted, INCREMENTAL], "priced");
    expect(r.qualifying).toEqual({ count: 2, pricedUniversityRateForWantOfReserve: 1 });
    expect(r.byTreatment.strategic.count).toBe(1);
  });

  it("leaves closed projects out of the totals and counts them apart", () => {
    const r = termReport([STRATEGIC, project({ id: "c", closed: true })], "priced");
    expect(r.totals.count).toBe(1);
    expect(r.closedCount).toBe(1);
  });

  it("can total only what is booked", () => {
    const r = termReport([STRATEGIC, project({ id: "e", stage: "estimate" })], "booked");
    expect(r.totals.count).toBe(1);
  });

  it("skips projects that haven't been priced, and has no webcast comparison without one", () => {
    const unpriced = project({ id: "u", full_economic_cost: null, lines: [] });
    const r = termReport([unpriced], "priced");
    expect(r.totals.count).toBe(0);
    expect(r.webcast).toBeNull();
  });
});

describe("inTerm", () => {
  const term = { starts_on: "2027-01-11", ends_on: "2027-05-07" };
  it("uses the event date, else the day the request was entered", () => {
    expect(inTerm({ event_starts_on: "2027-02-01", created_at: "2026-10-01T00:00:00Z" }, term)).toBe(true);
    expect(inTerm({ event_starts_on: null, created_at: "2027-02-01T00:00:00Z" }, term)).toBe(true);
    expect(inTerm({ event_starts_on: "2027-06-01", created_at: "2027-02-01T00:00:00Z" }, term)).toBe(false);
  });
});
