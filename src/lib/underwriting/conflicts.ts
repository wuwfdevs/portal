// Pure logic for Workflow D (docs/underwriting-design.md) — "a dashboard
// of schedule lines that can't currently be placed." Scoped to the two
// blockers this schema can actually check today: no approved, linked copy
// at all, or a still-unmet expected occurrence count with no eligible open
// break left. Spacing/clustering and daypart-level inventory accounting
// stay out — §7 keeps makegood_policy/notes advisory text, not a rules
// engine, until real contract patterns have exercised the manual
// placement path.

export type ScheduleLineConflictReason = "no_approved_copy" | "insufficient_inventory";

export interface ScheduleLineConflictCheckInput {
  hasApprovedLinkedCopy: boolean;
  eligibleOpenBreakCount: number;
  activePlacementCount: number;
  /** Total expected occurrences — null (open-ended, no fixed target) never triggers insufficient_inventory. */
  expectedOccurrences: number | null;
}

export function computeScheduleLineConflicts(input: ScheduleLineConflictCheckInput): ScheduleLineConflictReason[] {
  const reasons: ScheduleLineConflictReason[] = [];
  if (!input.hasApprovedLinkedCopy) reasons.push("no_approved_copy");
  if (
    input.expectedOccurrences != null &&
    input.activePlacementCount < input.expectedOccurrences &&
    input.eligibleOpenBreakCount === 0
  ) {
    reasons.push("insufficient_inventory");
  }
  return reasons;
}
