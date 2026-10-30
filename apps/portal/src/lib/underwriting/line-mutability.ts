// When a schedule line may be edited in place or removed outright
// (docs/underwriting-traffic-redesign.md §11.4). Pure, colocated test.
//
// The rule the delete policy (20260925170000, widened by 20260927130000)
// states: a line nothing has ever scheduled from has no history to keep, so
// a mistyped one is corrected or removed rather than cancelled from a date.
// Two states satisfy that — a line under a *draft revision* (a proposed
// change beside the live schedule), and any line on a *draft contract*
// (log_place_underwriting_credit() refuses a contract that is not active,
// so nothing can have scheduled from it). The setup wizard creates a
// contract's first revision as `current`, so a fresh contract is the second
// case, not the first; the first cut of the remove button only checked the
// revision and never appeared during setup at all.
//
// A line under the current revision of an active contract is the one with
// history: it is cancelled from a date, and the correction is a new line.

export interface LineMutabilityInput {
  contractStatus: string;
  revisionStatus: string;
  /** Non-superseded placements referencing the line — belt and braces; a draft contract has none. */
  placementCount?: number;
}

export function canRewriteScheduleLine(input: LineMutabilityInput): boolean {
  if ((input.placementCount ?? 0) > 0) return false;
  return input.contractStatus === "draft" || input.revisionStatus === "draft";
}
