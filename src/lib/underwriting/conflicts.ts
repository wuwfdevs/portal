// Pure logic for Workflow D (docs/underwriting-design.md) — "a dashboard of
// schedule lines that can't currently be placed", rebuilt for the demand
// bucket model (docs/underwriting-traffic-redesign.md §9). Scoped to what the
// schema can actually verify: approved linked copy exists; the contract's
// separation policy has been decided when the order stated one; every
// bucket ending within the look-ahead window that still has a fresh
// shortfall has at least one candidate break to fill it with; and a
// the line's pool has targets, and one of them reaches the line's program,
// days and time (pool-targets.ts's poolReachability — 2026-09-27).

import type { PoolReachability } from "./pool-targets";

export type ScheduleLineConflictReason =
  /** The line names a pool nobody has mapped to Log yet — nothing can place through it. */
  | "pool_unmapped"
  /** The pool's targets exist and none serves the line's program, days or time; the save-time refusal catches a new line, this catches a pool edited afterwards. */
  | "pool_unreachable"
  | "no_approved_copy"
  | "separation_policy_undecided"
  | "no_inventory_for_open_demand"
  | "makegoods_awaiting_agency_approval"
  /** A fixed-position line (exact/opening/closing) whose only eligible breaks in an upcoming period are already too full for its shortest approved copy — the capacity conflict bumping reports when no clean move exists. */
  | "capacity_conflict"
  /** An upcoming period's eligible breaks all fall in hours closed to underwriting (lib/log/underwriting-hours.ts) — automation can't fill it until the program director opens the hours or the line changes. */
  | "hours_closed";

export interface ScheduleLineConflictCheckInput {
  hasApprovedLinkedCopy: boolean;
  /** The contract printed a separation instruction that staff have not turned into a policy yet. */
  separationUndecided: boolean;
  /** Buckets still short of fresh placements whose end falls on or before the look-ahead date. */
  bucketsShortSoon: { freshShortfall: number; eligibleDates: string[] }[];
  /** Dates (YYYY-MM-DD) with at least one candidate break for this line. */
  datesWithInventory: Set<string>;
  makegoodsPendingApproval: number;
  /** The line's time rule fixes its position (exact, opening, closing) — only such a line can be blocked by capacity, since anything else takes any avail in its eligibility. */
  isFixedPosition?: boolean;
  /** Every candidate break for the line, with the room it has left, whether automation may use it, and whether it starts in hours closed to underwriting. */
  candidateBreaks?: {
    airDate: string;
    remainingSeconds: number;
    openToAutomation: boolean;
    closedToUnderwriting?: boolean;
  }[];
  /** The shortest approved copy linked to the line's contract, or null when none. */
  shortestApprovedCopySeconds?: number | null;
  /** Whether the line's pool reaches it (poolReachability); omit for a line with no pool. */
  poolReachability?: PoolReachability;
}

export function computeScheduleLineConflicts(
  input: ScheduleLineConflictCheckInput,
): ScheduleLineConflictReason[] {
  const reasons: ScheduleLineConflictReason[] = [];
  if (input.poolReachability?.kind === "no_targets") reasons.push("pool_unmapped");
  if (input.poolReachability?.kind === "unreachable") reasons.push("pool_unreachable");
  if (!input.hasApprovedLinkedCopy) reasons.push("no_approved_copy");
  if (input.separationUndecided) reasons.push("separation_policy_undecided");
  // A pool that can't reach the line is *why* there is no inventory; name
  // the cause, not the symptom too.
  const poolExplainsInventory = reasons.some(
    (reason) => reason === "pool_unmapped" || reason === "pool_unreachable",
  );
  if (
    !poolExplainsInventory &&
    input.bucketsShortSoon.some(
      (bucket) =>
        bucket.freshShortfall > 0 &&
        !bucket.eligibleDates.some((date) => input.datesWithInventory.has(date)),
    )
  ) {
    reasons.push("no_inventory_for_open_demand");
  }
  if (input.makegoodsPendingApproval > 0) reasons.push("makegoods_awaiting_agency_approval");
  // Inventory exists for the period, but every break of it is closed to
  // underwriting: name that, since "no inventory" would send staff to Log
  // for a rundown that already exists.
  if (
    input.candidateBreaks != null &&
    input.bucketsShortSoon.some((bucket) => {
      if (bucket.freshShortfall <= 0) return false;
      const onDates = input.candidateBreaks!.filter((brk) =>
        bucket.eligibleDates.includes(brk.airDate),
      );
      return onDates.length > 0 && onDates.every((brk) => brk.closedToUnderwriting);
    })
  ) {
    reasons.push("hours_closed");
  }
  if (
    input.isFixedPosition &&
    input.shortestApprovedCopySeconds != null &&
    input.candidateBreaks != null &&
    input.bucketsShortSoon.some((bucket) => {
      if (bucket.freshShortfall <= 0) return false;
      const onDates = input.candidateBreaks!.filter((brk) =>
        bucket.eligibleDates.includes(brk.airDate),
      );
      return (
        onDates.length > 0 &&
        !onDates.some(
          (brk) =>
            brk.openToAutomation && brk.remainingSeconds >= input.shortestApprovedCopySeconds!,
        )
      );
    })
  ) {
    reasons.push("capacity_conflict");
  }
  return reasons;
}

export const CONFLICT_LABEL: Record<ScheduleLineConflictReason, string> = {
  pool_unmapped: "The line's pool has no targets yet — map it on the Pools screen",
  pool_unreachable:
    "None of the pool's targets reaches the line's program, days or time — add a target, or change the pool on the line",
  no_approved_copy: "No approved copy linked",
  separation_policy_undecided:
    "The order states a separation rule nobody has turned into a policy yet",
  no_inventory_for_open_demand:
    "An upcoming period has demand but no eligible break to fill it with",
  makegoods_awaiting_agency_approval: "A makegood is waiting on agency approval",
  capacity_conflict:
    "A fixed-position credit has no room: its only eligible breaks in an upcoming period are full",
  hours_closed:
    "Every eligible break for an upcoming period falls in hours closed to underwriting — open them under On Air → Schedule → Underwriting, or change the line",
};
