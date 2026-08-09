import { describe, expect, it } from "vitest";
import {
  collapseToOnePerDay,
  planAutoFill,
  type AutoFillBreakCandidate,
  type AutoFillCopyCandidate,
  type AutoFillDemand,
} from "./auto-fill-plan";

function brk(overrides: Partial<AutoFillBreakCandidate> = {}): AutoFillBreakCandidate {
  return {
    breakId: "break-1",
    airDate: "2026-08-10",
    minutesOfDay: 7 * 60 + 49, // 7:49am, matching the default demand's target
    remainingSeconds: 30,
    lastItemUnderwriterId: null,
    lastItemCategory: null,
    ...overrides,
  };
}

function copy(overrides: Partial<AutoFillCopyCandidate> = {}): AutoFillCopyCandidate {
  return {
    id: "copy-1",
    approvalStatus: "approved",
    durationSeconds: 30,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    existingUsageCount: 0,
    ...overrides,
  };
}

function demand(overrides: Partial<AutoFillDemand> = {}): AutoFillDemand {
  return {
    awaitingSlotMakegoodIds: [],
    freshOccurrencesNeeded: 1,
    underwriterId: "underwriter-1",
    category: null,
    targetTimeMinutes: 7 * 60 + 49,
    coveredAirDates: [],
    ...overrides,
  };
}

describe("collapseToOnePerDay", () => {
  it("picks the break closest to the target time when a day has several", () => {
    const breaks = [
      brk({ breakId: "5am", minutesOfDay: 5 * 60 + 6 }),
      brk({ breakId: "7am", minutesOfDay: 7 * 60 + 6 }), // 43 min from 7:49
      brk({ breakId: "8am", minutesOfDay: 8 * 60 + 6 }), // 17 min from 7:49 — closest
      brk({ breakId: "8-19am", minutesOfDay: 8 * 60 + 19 }), // 30 min from 7:49
    ];
    const result = collapseToOnePerDay(breaks, 7 * 60 + 49, []);

    expect(result).toHaveLength(1);
    expect(result[0]?.breakId).toBe("8am");
  });

  it("keeps one candidate per distinct day", () => {
    const breaks = [
      brk({ breakId: "d1-a", airDate: "2026-08-10" }),
      brk({ breakId: "d1-b", airDate: "2026-08-10", minutesOfDay: 6 * 60 }),
      brk({ breakId: "d2-a", airDate: "2026-08-17" }),
    ];
    const result = collapseToOnePerDay(breaks, 7 * 60 + 49, []);

    expect(result.map((b) => b.airDate)).toEqual(["2026-08-10", "2026-08-17"]);
  });

  it("drops a day that already has an active placement", () => {
    const breaks = [brk({ breakId: "b1", airDate: "2026-08-10" }), brk({ breakId: "b2", airDate: "2026-08-17" })];
    const result = collapseToOnePerDay(breaks, 7 * 60 + 49, ["2026-08-10"]);

    expect(result.map((b) => b.breakId)).toEqual(["b2"]);
  });

  it("keeps the first-seen (soonest) break for a day when there is no target time", () => {
    const breaks = [
      brk({ breakId: "first", airDate: "2026-08-10", minutesOfDay: 5 * 60 }),
      brk({ breakId: "second", airDate: "2026-08-10", minutesOfDay: 9 * 60 }),
    ];
    const result = collapseToOnePerDay(breaks, null, []);

    expect(result.map((b) => b.breakId)).toEqual(["first"]);
  });
});

describe("planAutoFill", () => {
  it("places at most one credit per day even when a day offers several eligible breaks", () => {
    // Regression test for a real production bug: Morning Edition's local
    // opportunities recur every hour, so a single Monday offered 8 eligible
    // breaks and the first version of this planner filled every one of them.
    const breaks = [
      brk({ breakId: "5am", airDate: "2026-08-10", minutesOfDay: 5 * 60 + 6 }),
      brk({ breakId: "5-19am", airDate: "2026-08-10", minutesOfDay: 5 * 60 + 19 }),
      brk({ breakId: "6am", airDate: "2026-08-10", minutesOfDay: 6 * 60 + 6 }),
      brk({ breakId: "6-19am", airDate: "2026-08-10", minutesOfDay: 6 * 60 + 19 }),
      brk({ breakId: "7am", airDate: "2026-08-10", minutesOfDay: 7 * 60 + 6 }),
      brk({ breakId: "7-19am", airDate: "2026-08-10", minutesOfDay: 7 * 60 + 19 }),
      brk({ breakId: "8am", airDate: "2026-08-10", minutesOfDay: 8 * 60 + 6 }),
      brk({ breakId: "8-19am", airDate: "2026-08-10", minutesOfDay: 8 * 60 + 19 }),
    ];
    const plan = planAutoFill(breaks, demand({ freshOccurrencesNeeded: 26 }), [copy()]);

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.breakId).toBe("8am"); // 17 min from 7:49, closest of the eight
    expect(plan.demandExceedsSupply).toBe(true); // 26 expected, only 1 day currently available
  });

  it("fills fresh occurrences across distinct days up to the target", () => {
    const breaks = [brk({ breakId: "b1", airDate: "2026-08-10" }), brk({ breakId: "b2", airDate: "2026-08-17" }), brk({ breakId: "b3", airDate: "2026-08-24" })];
    const plan = planAutoFill(breaks, demand({ freshOccurrencesNeeded: 2 }), [copy()]);

    expect(plan.items).toEqual([
      { breakId: "b1", copyId: "copy-1", reason: "fresh" },
      { breakId: "b2", copyId: "copy-1", reason: "fresh" },
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.demandExceedsSupply).toBe(false);
  });

  it("never offers a day the line already has an active placement on", () => {
    const breaks = [brk({ breakId: "b1", airDate: "2026-08-10" }), brk({ breakId: "b2", airDate: "2026-08-17" })];
    const plan = planAutoFill(breaks, demand({ freshOccurrencesNeeded: 2, coveredAirDates: ["2026-08-10"] }), [copy()]);

    expect(plan.items).toEqual([{ breakId: "b2", copyId: "copy-1", reason: "fresh" }]);
  });

  it("drains awaiting-slot makegoods before any fresh occurrence", () => {
    const breaks = [brk({ breakId: "b1", airDate: "2026-08-10" }), brk({ breakId: "b2", airDate: "2026-08-17" })];
    const plan = planAutoFill(
      breaks,
      demand({ awaitingSlotMakegoodIds: ["mg-1"], freshOccurrencesNeeded: 1 }),
      [copy()],
    );

    expect(plan.items).toEqual([
      { breakId: "b1", copyId: "copy-1", reason: "makegood", makegoodId: "mg-1" },
      { breakId: "b2", copyId: "copy-1", reason: "fresh" },
    ]);
  });

  it("rotates between eligible copy, favoring whichever has been used least", () => {
    const breaks = [brk({ breakId: "b1", airDate: "2026-08-10" }), brk({ breakId: "b2", airDate: "2026-08-17" }), brk({ breakId: "b3", airDate: "2026-08-24" })];
    const copyA = copy({ id: "copy-a", existingUsageCount: 2 });
    const copyB = copy({ id: "copy-b", existingUsageCount: 0 });
    const plan = planAutoFill(breaks, demand({ freshOccurrencesNeeded: 3 }), [copyA, copyB]);

    // B starts out least-used (0 vs 2) and keeps winning until usage evens out,
    // at which point the id tie-break hands a turn back to A.
    expect(plan.items.map((item) => item.copyId)).toEqual(["copy-b", "copy-b", "copy-a"]);
  });

  it("skips a day with no eligible copy and tries the same request on the next day", () => {
    const breaks = [
      brk({ breakId: "too-short", airDate: "2026-08-10", remainingSeconds: 10 }),
      brk({ breakId: "b2", airDate: "2026-08-17", remainingSeconds: 30 }),
    ];
    const plan = planAutoFill(breaks, demand({ freshOccurrencesNeeded: 1 }), [copy()]);

    expect(plan.skipped).toEqual([{ breakId: "too-short", reason: "no_eligible_copy" }]);
    expect(plan.items).toEqual([{ breakId: "b2", copyId: "copy-1", reason: "fresh" }]);
  });

  it("excludes copy that is not approved, outside its effective dates, or too long", () => {
    const breaks = [brk({ breakId: "b1" })];
    const notApproved = copy({ id: "draft", approvalStatus: "draft" });
    const notYetEffective = copy({ id: "future", effectiveFrom: "2027-01-01" });
    const expired = copy({ id: "expired", effectiveTo: "2026-01-01" });
    const tooLong = copy({ id: "long", durationSeconds: 60 });
    const plan = planAutoFill(
      breaks,
      demand({ freshOccurrencesNeeded: 1 }),
      [notApproved, notYetEffective, expired, tooLong],
    );

    expect(plan.items).toEqual([]);
    expect(plan.skipped).toEqual([{ breakId: "b1", reason: "no_eligible_copy" }]);
  });

  it("reports demandExceedsSupply when there are more requests than eligible days", () => {
    const breaks = [brk({ breakId: "b1" })];
    const plan = planAutoFill(breaks, demand({ freshOccurrencesNeeded: 3 }), [copy()]);

    expect(plan.items).toHaveLength(1);
    expect(plan.demandExceedsSupply).toBe(true);
  });

  it("fills every available day for an open-ended line (null target)", () => {
    const breaks = [brk({ breakId: "b1", airDate: "2026-08-10" }), brk({ breakId: "b2", airDate: "2026-08-17" })];
    const plan = planAutoFill(breaks, demand({ freshOccurrencesNeeded: null }), [copy()]);

    expect(plan.items).toHaveLength(2);
    expect(plan.demandExceedsSupply).toBe(false);
  });

  it("does nothing when there is no demand at all", () => {
    const breaks = [brk({ breakId: "b1" })];
    const plan = planAutoFill(breaks, demand({ freshOccurrencesNeeded: 0 }), [copy()]);

    expect(plan.items).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.demandExceedsSupply).toBe(false);
  });

  it("skips a day whose last item is the same underwriter, and tries the next day", () => {
    const breaks = [
      brk({ breakId: "b1", airDate: "2026-08-10", lastItemUnderwriterId: "underwriter-1" }),
      brk({ breakId: "b2", airDate: "2026-08-17", lastItemUnderwriterId: "some-other-underwriter" }),
    ];
    const plan = planAutoFill(breaks, demand({ freshOccurrencesNeeded: 1, underwriterId: "underwriter-1" }), [copy()]);

    expect(plan.skipped).toEqual([{ breakId: "b1", reason: "same_underwriter_adjacent" }]);
    expect(plan.items).toEqual([{ breakId: "b2", copyId: "copy-1", reason: "fresh" }]);
  });

  it("skips a day whose last item shares this underwriter's category (same industry), even for a different underwriter", () => {
    const breaks = [
      brk({ breakId: "b1", airDate: "2026-08-10", lastItemUnderwriterId: "other-underwriter", lastItemCategory: "Lawyers" }),
      brk({ breakId: "b2", airDate: "2026-08-17", lastItemUnderwriterId: "other-underwriter", lastItemCategory: "Restaurants" }),
    ];
    const plan = planAutoFill(
      breaks,
      demand({ freshOccurrencesNeeded: 1, underwriterId: "underwriter-1", category: "Lawyers" }),
      [copy()],
    );

    expect(plan.skipped).toEqual([{ breakId: "b1", reason: "same_category_adjacent" }]);
    expect(plan.items).toEqual([{ breakId: "b2", copyId: "copy-1", reason: "fresh" }]);
  });

  it("does not flag adjacency when the candidate underwriter has no category", () => {
    const breaks = [brk({ breakId: "b1", lastItemUnderwriterId: "other-underwriter", lastItemCategory: null })];
    const plan = planAutoFill(breaks, demand({ freshOccurrencesNeeded: 1, category: null }), [copy()]);

    expect(plan.skipped).toEqual([]);
    expect(plan.items).toHaveLength(1);
  });

  it("allows a different underwriter with a different category to fill right after another credit", () => {
    const breaks = [brk({ breakId: "b1", lastItemUnderwriterId: "other-underwriter", lastItemCategory: "Restaurants" })];
    const plan = planAutoFill(
      breaks,
      demand({ freshOccurrencesNeeded: 1, underwriterId: "underwriter-1", category: "Lawyers" }),
      [copy()],
    );

    expect(plan.skipped).toEqual([]);
    expect(plan.items).toEqual([{ breakId: "b1", copyId: "copy-1", reason: "fresh" }]);
  });
});
