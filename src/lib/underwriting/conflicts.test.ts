import { describe, expect, it } from "vitest";
import { computeScheduleLineConflicts } from "./conflicts";
function period(overrides: { freshShortfall?: number; eligibleDates?: string[] } = {}) {
  return {
    eligibleDates: ["2026-09-28", "2026-09-29"],
    freshShortfall: 2,
    ...overrides,
  };
}

describe("computeScheduleLineConflicts", () => {
  it("flags missing copy and an undecided separation rule", () => {
    expect(
      computeScheduleLineConflicts({
        hasApprovedLinkedCopy: false,
        separationUndecided: true,
        bucketsShortSoon: [],
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
        bucketsShortSoon: [period()],
        datesWithInventory: new Set(["2026-09-29"]),
      }),
    ).toEqual([]);
    expect(
      computeScheduleLineConflicts({
        ...base,
        bucketsShortSoon: [period()],
        datesWithInventory: new Set(["2026-10-06"]),
      }),
    ).toEqual(["no_inventory_for_open_demand"]);
    expect(
      computeScheduleLineConflicts({
        ...base,
        bucketsShortSoon: [period({ freshShortfall: 0 })],
        datesWithInventory: new Set(),
      }),
    ).toEqual([]);
  });
});
