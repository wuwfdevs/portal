import { describe, expect, it } from "vitest";
import { NO_BADGE_FACTS, badgesFor, datesNeedAttention } from "./badges";

describe("badgesFor", () => {
  it("shows nothing for the routine case", () => {
    expect(badgesFor(NO_BADGE_FACTS)).toEqual([]);
  });

  it("names each unusual fact, in a stable order", () => {
    expect(
      badgesFor({
        pricingOverridden: true,
        bookingException: true,
        reserveDepleted: true,
        datesNeedAttention: true,
        aboveMarket: true,
        scopeAdjusted: true,
        customPackage: true,
      }),
    ).toEqual([
      "pricing_changed",
      "booking_exception",
      "reserve_depleted",
      "dates_need_attention",
      "above_market",
      "scope_adjusted",
      "custom_package",
    ]);
  });
});

describe("datesNeedAttention", () => {
  const routine = {
    asksForProduction: true,
    disposition: null,
    stage: "request",
    datesMode: "auto",
    hasPackageLine: true,
    eventStartsOn: "2027-02-01",
    openBookings: 0,
  };
  it("is true for an auto-planned request whose plan wrote nothing", () => {
    expect(datesNeedAttention(routine)).toBe(true);
  });
  it("is false once there are dates, in manual mode, closed, or past the request stage", () => {
    expect(datesNeedAttention({ ...routine, openBookings: 2 })).toBe(false);
    expect(datesNeedAttention({ ...routine, datesMode: "manual" })).toBe(false);
    expect(datesNeedAttention({ ...routine, disposition: "declined" })).toBe(false);
    expect(datesNeedAttention({ ...routine, stage: "estimate" })).toBe(false);
    expect(datesNeedAttention({ ...routine, eventStartsOn: null })).toBe(false);
    expect(datesNeedAttention({ ...routine, hasPackageLine: false })).toBe(false);
  });
});

import { projectBadgeFacts } from "./badges";

describe("projectBadgeFacts", () => {
  const routine = {
    requested: "production",
    disposition: null,
    stage: "request",
    dates_mode: "auto",
    event_starts_on: "2027-02-01",
    pricing_overridden_by: null,
    qualifies_strategic: true,
    reserve_depleted: false,
  };
  const dates = { hasPackageLine: true, openBookings: 2, bookingException: false };

  it("a routine request has no badges", () => {
    expect(badgesFor(projectBadgeFacts(routine, dates))).toEqual([]);
  });

  it("flags a hand-set price, an exception booking and a reserve that ran out", () => {
    expect(
      badgesFor(
        projectBadgeFacts(
          { ...routine, pricing_overridden_by: "u", reserve_depleted: true },
          { ...dates, bookingException: true },
        ),
      ),
    ).toEqual(["pricing_changed", "booking_exception", "reserve_depleted"]);
  });

  it("keeps a qualifying project that was priced at the university rate flagged, not 'no'", () => {
    expect(
      projectBadgeFacts({ ...routine, reserve_depleted: true }, dates).reserveDepleted,
    ).toBe(true);
    expect(
      projectBadgeFacts({ ...routine, qualifies_strategic: false, reserve_depleted: true }, dates)
        .reserveDepleted,
    ).toBe(false);
  });

  it("flags dates that need attention from the plan or from hand-planned dates the rule would refuse", () => {
    expect(
      projectBadgeFacts(routine, { ...dates, openBookings: 0 }).datesNeedAttention,
    ).toBe(true);
    expect(
      projectBadgeFacts({ ...routine, dates_mode: "manual" }, { ...dates, failingPlannedDates: 1 })
        .datesNeedAttention,
    ).toBe(true);
  });

  it("carries the estimate-level facts through: above market from the stored benchmark, scope and package from the lines", () => {
    expect(
      badgesFor(
        projectBadgeFacts(
          { ...routine, market_benchmarks: [{ rate: 1200, ceiling: 1000 }] },
          { ...dates, scopeAdjusted: true, customPackage: true },
        ),
      ),
    ).toEqual(["above_market", "scope_adjusted", "custom_package"]);
  });

  it("never calls a rate above market without a ceiling, or at or under it", () => {
    expect(
      projectBadgeFacts({ ...routine, market_benchmarks: [{ rate: 1200, ceiling: null }] }, dates)
        .aboveMarket,
    ).toBe(false);
    expect(
      projectBadgeFacts({ ...routine, market_benchmarks: [{ rate: 1000, ceiling: 1000 }] }, dates)
        .aboveMarket,
    ).toBe(false);
  });
});
