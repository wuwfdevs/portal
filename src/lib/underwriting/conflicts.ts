// Pure logic for Workflow D (docs/underwriting-design.md) — "a dashboard
// of obligations that can't currently be placed." Scoped to the two
// blockers this schema can actually check today: no approved, linked copy
// at all, or a still-unmet quantity with no eligible open slot left.
// Spacing/clustering and daypart-level inventory accounting stay out —
// §7 keeps distribution_rule advisory text, not a rules engine, until real
// contract patterns have exercised the manual placement path.

export type ObligationConflictReason = "no_approved_copy" | "insufficient_inventory";

export interface ObligationConflictCheckInput {
  hasApprovedLinkedCopy: boolean;
  eligibleOpenSlotCount: number;
  activePlacementCount: number;
  quantityRequired: number;
}

export function computeObligationConflicts(input: ObligationConflictCheckInput): ObligationConflictReason[] {
  const reasons: ObligationConflictReason[] = [];
  if (!input.hasApprovedLinkedCopy) reasons.push("no_approved_copy");
  if (input.activePlacementCount < input.quantityRequired && input.eligibleOpenSlotCount === 0) {
    reasons.push("insufficient_inventory");
  }
  return reasons;
}
