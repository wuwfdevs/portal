import { describe, expect, it } from "vitest";
import { planAutoFill, type AutoFillBreakCandidate, type AutoFillCopyCandidate } from "./auto-fill-plan";

function brk(overrides: Partial<AutoFillBreakCandidate> = {}): AutoFillBreakCandidate {
  return { breakId: "break-1", airDate: "2026-08-10", remainingSeconds: 30, ...overrides };
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

describe("planAutoFill", () => {
  it("fills fresh occurrences into eligible breaks up to the target", () => {
    const breaks = [brk({ breakId: "b1" }), brk({ breakId: "b2" }), brk({ breakId: "b3" })];
    const plan = planAutoFill(breaks, { awaitingSlotMakegoodIds: [], freshOccurrencesNeeded: 2 }, [copy()]);

    expect(plan.items).toEqual([
      { breakId: "b1", copyId: "copy-1", reason: "fresh" },
      { breakId: "b2", copyId: "copy-1", reason: "fresh" },
    ]);
    expect(plan.skippedBreakIds).toEqual([]);
    expect(plan.demandExceedsSupply).toBe(false);
  });

  it("drains awaiting-slot makegoods before any fresh occurrence", () => {
    const breaks = [brk({ breakId: "b1" }), brk({ breakId: "b2" })];
    const plan = planAutoFill(
      breaks,
      { awaitingSlotMakegoodIds: ["mg-1"], freshOccurrencesNeeded: 1 },
      [copy()],
    );

    expect(plan.items).toEqual([
      { breakId: "b1", copyId: "copy-1", reason: "makegood", makegoodId: "mg-1" },
      { breakId: "b2", copyId: "copy-1", reason: "fresh" },
    ]);
  });

  it("rotates between eligible copy, favoring whichever has been used least", () => {
    const breaks = [brk({ breakId: "b1" }), brk({ breakId: "b2" }), brk({ breakId: "b3" })];
    const copyA = copy({ id: "copy-a", existingUsageCount: 2 });
    const copyB = copy({ id: "copy-b", existingUsageCount: 0 });
    const plan = planAutoFill(breaks, { awaitingSlotMakegoodIds: [], freshOccurrencesNeeded: 3 }, [copyA, copyB]);

    // B starts out least-used (0 vs 2) and keeps winning until usage evens out,
    // at which point the id tie-break hands a turn back to A.
    expect(plan.items.map((item) => item.copyId)).toEqual(["copy-b", "copy-b", "copy-a"]);
  });

  it("skips a break with no eligible copy and tries the same request on the next one", () => {
    const breaks = [brk({ breakId: "too-short", remainingSeconds: 10 }), brk({ breakId: "b2", remainingSeconds: 30 })];
    const plan = planAutoFill(breaks, { awaitingSlotMakegoodIds: [], freshOccurrencesNeeded: 1 }, [copy()]);

    expect(plan.skippedBreakIds).toEqual(["too-short"]);
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
      { awaitingSlotMakegoodIds: [], freshOccurrencesNeeded: 1 },
      [notApproved, notYetEffective, expired, tooLong],
    );

    expect(plan.items).toEqual([]);
    expect(plan.skippedBreakIds).toEqual(["b1"]);
  });

  it("reports demandExceedsSupply when there are more requests than breaks", () => {
    const breaks = [brk({ breakId: "b1" })];
    const plan = planAutoFill(breaks, { awaitingSlotMakegoodIds: [], freshOccurrencesNeeded: 3 }, [copy()]);

    expect(plan.items).toHaveLength(1);
    expect(plan.demandExceedsSupply).toBe(true);
  });

  it("fills every available break for an open-ended line (null target)", () => {
    const breaks = [brk({ breakId: "b1" }), brk({ breakId: "b2" })];
    const plan = planAutoFill(breaks, { awaitingSlotMakegoodIds: [], freshOccurrencesNeeded: null }, [copy()]);

    expect(plan.items).toHaveLength(2);
    expect(plan.demandExceedsSupply).toBe(false);
  });

  it("does nothing when there is no demand at all", () => {
    const breaks = [brk({ breakId: "b1" })];
    const plan = planAutoFill(breaks, { awaitingSlotMakegoodIds: [], freshOccurrencesNeeded: 0 }, [copy()]);

    expect(plan.items).toEqual([]);
    expect(plan.skippedBreakIds).toEqual([]);
    expect(plan.demandExceedsSupply).toBe(false);
  });
});
