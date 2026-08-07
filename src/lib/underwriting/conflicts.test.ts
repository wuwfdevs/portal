import { describe, expect, it } from "vitest";
import { computeScheduleLineConflicts, type ScheduleLineConflictCheckInput } from "./conflicts";

function input(overrides: Partial<ScheduleLineConflictCheckInput> = {}): ScheduleLineConflictCheckInput {
  return {
    hasApprovedLinkedCopy: true,
    eligibleOpenBreakCount: 3,
    activePlacementCount: 0,
    expectedOccurrences: 4,
    ...overrides,
  };
}

describe("computeScheduleLineConflicts", () => {
  it("flags nothing when copy is approved and breaks remain", () => {
    expect(computeScheduleLineConflicts(input())).toEqual([]);
  });

  it("flags missing approved copy", () => {
    expect(computeScheduleLineConflicts(input({ hasApprovedLinkedCopy: false }))).toEqual(["no_approved_copy"]);
  });

  it("flags insufficient inventory once the quota is unmet and nothing is open", () => {
    expect(
      computeScheduleLineConflicts(input({ eligibleOpenBreakCount: 0, activePlacementCount: 1 })),
    ).toEqual(["insufficient_inventory"]);
  });

  it("does not flag insufficient inventory once the quota is already met", () => {
    expect(
      computeScheduleLineConflicts(input({ eligibleOpenBreakCount: 0, activePlacementCount: 4 })),
    ).toEqual([]);
  });

  it("does not flag insufficient inventory for an open-ended line with no fixed target", () => {
    expect(
      computeScheduleLineConflicts(input({ eligibleOpenBreakCount: 0, activePlacementCount: 0, expectedOccurrences: null })),
    ).toEqual([]);
  });

  it("can flag both reasons at once", () => {
    expect(
      computeScheduleLineConflicts(
        input({ hasApprovedLinkedCopy: false, eligibleOpenBreakCount: 0, activePlacementCount: 0 }),
      ),
    ).toEqual(["no_approved_copy", "insufficient_inventory"]);
  });
});
