import { describe, expect, it } from "vitest";
import { computeObligationConflicts, type ObligationConflictCheckInput } from "./conflicts";

function input(overrides: Partial<ObligationConflictCheckInput> = {}): ObligationConflictCheckInput {
  return {
    hasApprovedLinkedCopy: true,
    eligibleOpenSlotCount: 3,
    activePlacementCount: 0,
    quantityRequired: 4,
    ...overrides,
  };
}

describe("computeObligationConflicts", () => {
  it("flags nothing when copy is approved and slots remain", () => {
    expect(computeObligationConflicts(input())).toEqual([]);
  });

  it("flags missing approved copy", () => {
    expect(computeObligationConflicts(input({ hasApprovedLinkedCopy: false }))).toEqual(["no_approved_copy"]);
  });

  it("flags insufficient inventory once the quota is unmet and nothing is open", () => {
    expect(
      computeObligationConflicts(input({ eligibleOpenSlotCount: 0, activePlacementCount: 1 })),
    ).toEqual(["insufficient_inventory"]);
  });

  it("does not flag insufficient inventory once the quota is already met", () => {
    expect(
      computeObligationConflicts(input({ eligibleOpenSlotCount: 0, activePlacementCount: 4 })),
    ).toEqual([]);
  });

  it("can flag both reasons at once", () => {
    expect(
      computeObligationConflicts(
        input({ hasApprovedLinkedCopy: false, eligibleOpenSlotCount: 0, activePlacementCount: 0 }),
      ),
    ).toEqual(["no_approved_copy", "insufficient_inventory"]);
  });
});
