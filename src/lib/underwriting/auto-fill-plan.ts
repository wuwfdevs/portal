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
// A break can hold several different underwriters' credits at once when its
// remaining capacity allows, but the same underwriter never runs back to
// back, and neither does the same industry — a real contractual promise,
// not a style preference: the reference Autumn Beck Blackledge agreement's
// own terms say "WUWF will make appropriate changes in scheduling to insure
// that your sponsorship message does not run adjacent to a business with
// similar services or products," and its own conflict category is
// "Lawyers." Manual placement surfaces this as an advisory a human decides
// what to do with (lib/underwriting/adjacency.ts); auto-fill has no human
// in the loop at the moment it places a credit, so here it's an enforced
// rule instead. "Back to back" only ever means immediately adjacent within
// one break (cross-break adjacency is out of scope) — and since
// log_place_underwriting_credit() always appends at the end of a break, the
// only item a newly-placed one could ever be adjacent to is whichever one
// currently holds the break's highest position, so that's all a candidate
// break needs to carry.
//
// One schedule line's own demand still never places two of its own items
// into the same break in a single pass: every item on one line shares that
// line's underwriter, so the same-underwriter rule already rules that out
// structurally — this file doesn't need special-case logic for it.
//
// AT MOST ONE CREDIT PER CALENDAR DAY, per schedule line — a real bug fix,
// not a style choice. "Monday ~7:49am x26 weeks" means one credit that
// Monday, but a program's local opportunities can recur every hour (e.g.
// Morning Edition's generic post-newscast avails), so a single Monday's
// rundown can offer several eligible breaks — one at 5:06am, one at
// 6:06am, one at 7:06am, and so on. Confirmed live in production: the
// first version of this planner had no day-level cap at all and filled
// every one of those breaks in a single run, consuming 26 weeks' worth of
// demand against one calendar day. collapseToOnePerDay() picks the single
// break per day closest to the line's own target_time (or the earliest, if
// the line has none) before demand is ever assigned to a break, and drops
// any day the line already has an active placement on outright — that
// day's slot is spoken for, whether or not it later airs compliantly (a
// missed one is resolved by its own makegood claiming a *different* day,
// never a second credit stacked onto the same one).

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
  /** Minutes since midnight, station-local time (see lib/log/timezone.ts) — compared against the schedule line's own targetTimeMinutes to pick the best of several same-day candidates. */
  minutesOfDay: number;
  remainingSeconds: number;
  /** Underwriter id of whichever credit currently holds this break's highest position, if any — null for an empty break or one whose last item isn't a credit. */
  lastItemUnderwriterId: string | null;
  /** That same last item's underwriter category, if set — null otherwise. */
  lastItemCategory: string | null;
}

export interface AutoFillDemand {
  /** Makegood ids awaiting a slot on this schedule line, oldest first. */
  awaitingSlotMakegoodIds: string[];
  /** Brand-new occurrences still needed beyond what's already pending or awaiting a makegood slot. Null for an open-ended schedule line — fill every eligible day available instead of stopping at a target. */
  freshOccurrencesNeeded: number | null;
  /** This schedule line's own underwriter — checked against each candidate break's last item so the same underwriter never runs back to back within one break. */
  underwriterId: string;
  /** That underwriter's category, if set — checked the same way so two underwriters from the same industry never run back to back within one break. */
  category: string | null;
  /** The schedule line's own target_time, as minutes since midnight station-local — null if the line has none set. Picks which of several same-day breaks is "the" one for that day. */
  targetTimeMinutes: number | null;
  /** air_date (YYYY-MM-DD) values this schedule line already has an active (non-superseded) placement on — dropped from consideration entirely, fresh or makegood. */
  coveredAirDates: string[];
}

export type AutoFillPlanItemReason = "makegood" | "fresh";

export interface AutoFillPlanItem {
  breakId: string;
  copyId: string;
  reason: AutoFillPlanItemReason;
  makegoodId?: string;
}

export type AutoFillSkipReason = "same_underwriter_adjacent" | "same_category_adjacent" | "no_eligible_copy";

export interface AutoFillSkippedBreak {
  breakId: string;
  reason: AutoFillSkipReason;
}

export interface AutoFillPlan {
  items: AutoFillPlanItem[];
  /** Breaks that had demand queued for them but were passed over — either an adjacency conflict, or no linked copy fit (approved, in date, short enough). Breaks dropped by collapseToOnePerDay for having a same-day sibling, or for a day already covered, never appear here — they were never really "considered" for this pass. */
  skipped: AutoFillSkippedBreak[];
  /** True when demand (makegoods + fresh occurrences) outlasted the eligible days available this pass. */
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
 * Reduces a flat list of eligible breaks (assumed soonest-first) to at most
 * one per calendar day — whichever is closest to targetTimeMinutes (ties
 * broken by whichever appeared first), or simply the first-seen break of
 * the day when the line has no target_time. Days already in
 * coveredAirDates are dropped outright. Result stays soonest-first.
 */
export function collapseToOnePerDay(
  breaks: AutoFillBreakCandidate[],
  targetTimeMinutes: number | null,
  coveredAirDates: string[],
): AutoFillBreakCandidate[] {
  const covered = new Set(coveredAirDates);
  const byDay = new Map<string, AutoFillBreakCandidate>();

  for (const brk of breaks) {
    if (covered.has(brk.airDate)) continue;
    const existing = byDay.get(brk.airDate);
    if (!existing) {
      byDay.set(brk.airDate, brk);
      continue;
    }
    if (targetTimeMinutes == null) continue; // first-seen (soonest) already wins with no target to compare against

    const existingDistance = Math.abs(existing.minutesOfDay - targetTimeMinutes);
    const candidateDistance = Math.abs(brk.minutesOfDay - targetTimeMinutes);
    if (candidateDistance < existingDistance) byDay.set(brk.airDate, brk);
  }

  return [...byDay.values()].sort((a, b) => (a.airDate === b.airDate ? a.minutesOfDay - b.minutesOfDay : a.airDate < b.airDate ? -1 : 1));
}

/**
 * Assigns eligible breaks — first collapsed to at most one per calendar day
 * (see collapseToOnePerDay) — to queued demand — makegoods first, then
 * fresh occurrences — choosing whichever eligible linked copy has been
 * used least so far to rotate fairly between a contract's messages. A
 * break that would put the same underwriter or the same industry back to
 * back, or has no eligible copy, is skipped and the same request tries the
 * next day's break instead of being dropped.
 */
export function planAutoFill(
  breaks: AutoFillBreakCandidate[],
  demand: AutoFillDemand,
  copyCandidates: AutoFillCopyCandidate[],
): AutoFillPlan {
  const dailyBreaks = collapseToOnePerDay(breaks, demand.targetTimeMinutes, demand.coveredAirDates);

  const requests: AutoFillRequest[] = demand.awaitingSlotMakegoodIds.map((makegoodId) => ({
    reason: "makegood" as const,
    makegoodId,
  }));
  const freshCount = demand.freshOccurrencesNeeded ?? dailyBreaks.length;
  for (let i = 0; i < freshCount; i++) requests.push({ reason: "fresh" });

  const usageCounts = new Map(copyCandidates.map((copy) => [copy.id, copy.existingUsageCount]));
  const items: AutoFillPlanItem[] = [];
  const skipped: AutoFillSkippedBreak[] = [];
  let requestIndex = 0;

  for (const brk of dailyBreaks) {
    if (requestIndex >= requests.length) break;

    if (brk.lastItemUnderwriterId === demand.underwriterId) {
      skipped.push({ breakId: brk.breakId, reason: "same_underwriter_adjacent" });
      continue;
    }
    if (demand.category != null && brk.lastItemCategory === demand.category) {
      skipped.push({ breakId: brk.breakId, reason: "same_category_adjacent" });
      continue;
    }

    const eligible = copyCandidates
      .filter((copy) => isCopyEligible(copy, brk))
      .sort((a, b) => (usageCounts.get(a.id)! - usageCounts.get(b.id)!) || a.id.localeCompare(b.id));

    if (eligible.length === 0) {
      skipped.push({ breakId: brk.breakId, reason: "no_eligible_copy" });
      continue;
    }

    const chosen = eligible[0]!;
    usageCounts.set(chosen.id, (usageCounts.get(chosen.id) ?? 0) + 1);

    const request = requests[requestIndex]!;
    items.push({ breakId: brk.breakId, copyId: chosen.id, reason: request.reason, makegoodId: request.makegoodId });
    requestIndex++;
  }

  return { items, skipped, demandExceedsSupply: requestIndex < requests.length };
}
