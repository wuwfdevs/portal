import { describe, expect, it } from "vitest";
import { computeScheduleLineConflicts } from "./conflicts";
import type { PeriodFulfillment } from "./demand";

function period(overrides: Partial<PeriodFulfillment> = {}): PeriodFulfillment {
  return {
    kind: "week",
    periodStart: "2026-09-28",
    periodEnd: "2026-10-04",
    eligibleDates: ["2026-09-28", "2026-09-29"],
    quantity: 2,
    maxPerDay: 1,
    partialWeek: false,
    scheduled: 0,
    aired: 0,
    missed: 0,
    makegoodsAwaitingSlot: 0,
    makegoodsScheduled: 0,
    makegoodsAired: 0,
    freshShortfall: 2,
    delivered: 0,
    ...overrides,
  };
}

describe("computeScheduleLineConflicts", () => {
  it("flags missing copy and an undecided separation rule", () => {
    expect(
      computeScheduleLineConflicts({
        hasApprovedLinkedCopy: false,
        separationUndecided: true,
        periodsShortSoon: [],
        datesWithInventory: new Set(),
        makegoodsPendingApproval: 0,
      }),
    ).toEqual(["no_approved_copy", "separation_policy_undecided"]);
  });

  it("flags open demand only when none of its eligible dates has a break", () => {
    const base = {
      hasApprovedLinkedCopy: true,
      separationUndecided: false,
      makegoodsPendingApproval: 0,
    };
    expect(
      computeScheduleLineConflicts({
        ...base,
        periodsShortSoon: [period()],
        datesWithInventory: new Set(["2026-09-29"]),
      }),
    ).toEqual([]);
    expect(
      computeScheduleLineConflicts({
        ...base,
        periodsShortSoon: [period()],
        datesWithInventory: new Set(["2026-10-06"]),
      }),
    ).toEqual(["no_inventory_for_open_demand"]);
    expect(
      computeScheduleLineConflicts({
        ...base,
        periodsShortSoon: [period({ freshShortfall: 0 })],
        datesWithInventory: new Set(),
      }),
    ).toEqual([]);
  });
});
