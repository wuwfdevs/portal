// Pure planning logic for the rules-based auto-fill scheduler
// (docs/underwriting-design.md §7 "Automatic rules-based scheduling"). No
// Supabase import, no knowledge of how a plan actually gets written — the
// execution side (lib/underwriting/auto-fill.ts) writes every planned item
// through the exact same log_place_underwriting_credit() RPC the manual
// "Place a credit" form uses, per the design doc's own "a human choosing
// the break today, a rules engine choosing it later."
//
// Demand has two sources, and a schedule line's makegoods drain first: a
// makegood awaiting a slot is a credit that already aired non-compliantly
// and is specifically overdue, so it goes back into the same fill queue as
// an ordinary not-yet-scheduled occurrence rather than requiring its own
// separate manual pick.
//
// One planned item per break, always — even when a break's allow_multiple
// and remaining capacity could in principle fit more than one short credit,
// this pass never double-books a single break. Real WUWF schedule lines
// place one credit per break; packing several into a single break in one
// pass is behavior no real contract pattern has exercised yet.

import type { UwCopyApprovalStatus } from "@/lib/database.types";

export interface AutoFillCopyCandidate {
  id: string;
  approvalStatus: UwCopyApprovalStatus;
  durationSeconds: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** Placements already using this copy on this schedule line, before this pass — seeds rotation fairness so one message doesn't always win. */
  existingUsageCount: number;
}

export interface AutoFillBreakCandidate {
  breakId: string;
  /** YYYY-MM-DD — checked against a candidate's effective_from/effective_to, the same as log_place_underwriting_credit() checks against the rundown's own air_date. */
  airDate: string;
  remainingSeconds: number;
}

export interface AutoFillDemand {
  /** Makegood ids awaiting a slot on this schedule line, oldest first. */
  awaitingSlotMakegoodIds: string[];
  /** Brand-new occurrences still needed beyond what's already pending or awaiting a makegood slot. Null for an open-ended schedule line — fill every eligible break available instead of stopping at a target. */
  freshOccurrencesNeeded: number | null;
}

export type AutoFillPlanItemReason = "makegood" | "fresh";

export interface AutoFillPlanItem {
  breakId: string;
  copyId: string;
  reason: AutoFillPlanItemReason;
  makegoodId?: string;
}

export interface AutoFillPlan {
  items: AutoFillPlanItem[];
  /** Breaks that had demand queued for them but no linked copy fit (approved, in date, short enough). */
  skippedBreakIds: string[];
  /** True when demand (makegoods + fresh occurrences) outlasted the eligible breaks available this pass. */
  demandExceedsSupply: boolean;
}

interface AutoFillRequest {
  reason: AutoFillPlanItemReason;
  makegoodId?: string;
}

function isCopyEligible(copy: AutoFillCopyCandidate, brk: AutoFillBreakCandidate): boolean {
  if (copy.approvalStatus !== "approved") return false;
  if (copy.durationSeconds == null || copy.durationSeconds > brk.remainingSeconds) return false;
  if (copy.effectiveFrom > brk.airDate) return false;
  if (copy.effectiveTo != null && copy.effectiveTo < brk.airDate) return false;
  return true;
}

/**
 * Assigns eligible breaks (assumed soonest-first, matching
 * log_list_placeable_rundown_breaks' own order) to queued demand —
 * makegoods first, then fresh occurrences — choosing whichever eligible
 * linked copy has been used least so far to rotate fairly between a
 * contract's messages. A break with no eligible copy is skipped and the
 * same request tries the next break instead of being dropped.
 */
export function planAutoFill(
  breaks: AutoFillBreakCandidate[],
  demand: AutoFillDemand,
  copyCandidates: AutoFillCopyCandidate[],
): AutoFillPlan {
  const requests: AutoFillRequest[] = demand.awaitingSlotMakegoodIds.map((makegoodId) => ({
    reason: "makegood" as const,
    makegoodId,
  }));
  const freshCount = demand.freshOccurrencesNeeded ?? breaks.length;
  for (let i = 0; i < freshCount; i++) requests.push({ reason: "fresh" });

  const usageCounts = new Map(copyCandidates.map((copy) => [copy.id, copy.existingUsageCount]));
  const items: AutoFillPlanItem[] = [];
  const skippedBreakIds: string[] = [];
  let requestIndex = 0;

  for (const brk of breaks) {
    if (requestIndex >= requests.length) break;

    const eligible = copyCandidates
      .filter((copy) => isCopyEligible(copy, brk))
      .sort((a, b) => (usageCounts.get(a.id)! - usageCounts.get(b.id)!) || a.id.localeCompare(b.id));

    if (eligible.length === 0) {
      skippedBreakIds.push(brk.breakId);
      continue;
    }

    const chosen = eligible[0]!;
    usageCounts.set(chosen.id, (usageCounts.get(chosen.id) ?? 0) + 1);

    const request = requests[requestIndex]!;
    items.push({ breakId: brk.breakId, copyId: chosen.id, reason: request.reason, makegoodId: request.makegoodId });
    requestIndex++;
  }

  return { items, skippedBreakIds, demandExceedsSupply: requestIndex < requests.length };
}
