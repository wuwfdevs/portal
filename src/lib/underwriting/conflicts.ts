// Pure logic for Workflow D (docs/underwriting-design.md) — "a dashboard of
// schedule lines that can't currently be placed", rebuilt for the demand
// bucket model (docs/underwriting-traffic-redesign.md §9). Scoped to what the
// schema can actually verify: approved linked copy exists; the contract's
// separation policy has been decided when the order stated one; every
// bucket ending within the look-ahead window that still has a fresh
// shortfall has at least one candidate break to fill it with; and a
// position-specific line's traffic key exists on at least one break.

export type ScheduleLineConflictReason =
  | "no_approved_copy"
  | "separation_policy_undecided"
  | "no_inventory_for_open_demand"
  | "makegoods_awaiting_agency_approval";

export interface ScheduleLineConflictCheckInput {
  hasApprovedLinkedCopy: boolean;
  /** The contract printed a separation instruction that staff have not turned into a policy yet. */
  separationUndecided: boolean;
  /** Buckets still short of fresh placements whose end falls on or before the look-ahead date. */
  bucketsShortSoon: { freshShortfall: number; eligibleDates: string[] }[];
  /** Dates (YYYY-MM-DD) with at least one candidate break for this line. */
  datesWithInventory: Set<string>;
  makegoodsPendingApproval: number;
}

export function computeScheduleLineConflicts(
  input: ScheduleLineConflictCheckInput,
): ScheduleLineConflictReason[] {
  const reasons: ScheduleLineConflictReason[] = [];
  if (!input.hasApprovedLinkedCopy) reasons.push("no_approved_copy");
  if (input.separationUndecided) reasons.push("separation_policy_undecided");
  if (
    input.bucketsShortSoon.some(
      (bucket) =>
        bucket.freshShortfall > 0 &&
        !bucket.eligibleDates.some((date) => input.datesWithInventory.has(date)),
    )
  ) {
    reasons.push("no_inventory_for_open_demand");
  }
  if (input.makegoodsPendingApproval > 0) reasons.push("makegoods_awaiting_agency_approval");
  return reasons;
}

export const CONFLICT_LABEL: Record<ScheduleLineConflictReason, string> = {
  no_approved_copy: "No approved copy linked",
  separation_policy_undecided:
    "The order states a separation rule nobody has turned into a policy yet",
  no_inventory_for_open_demand:
    "An upcoming period has demand but no eligible break to fill it with",
  makegoods_awaiting_agency_approval: "A makegood is waiting on agency approval",
};
