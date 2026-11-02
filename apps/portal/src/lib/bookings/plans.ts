// Which term plan applies — pure, no Supabase, no React. docs/bookings-design.md §22.3.
//
// A plan is bookable when it is active, and several may be active at once so long
// as their dates do not overlap (`bk_guard_term_plan()` refuses the overlap). A
// booking's plan is the active plan whose dates contain its date; the screens that
// show "the" term show the current one. Nothing here reads "the one active plan".

import type { BkTermPlanStatus } from "@/lib/database.types";

export interface PlanSpan {
  id: string;
  starts_on: string;
  ends_on: string;
  status: BkTermPlanStatus;
}

/** Whether two inclusive date ranges share a day. */
export function rangesOverlap(
  a: { starts_on: string; ends_on: string },
  b: { starts_on: string; ends_on: string },
): boolean {
  return a.starts_on <= b.ends_on && b.starts_on <= a.ends_on;
}

/** The active plan whose dates contain `date`, or null when no active plan covers it. */
export function planForDate<T extends PlanSpan>(plans: readonly T[], date: string): T | null {
  return (
    plans.find(
      (plan) => plan.status === "active" && plan.starts_on <= date && date <= plan.ends_on,
    ) ?? null
  );
}

/**
 * The plan a screen shows when it has no date to go by: the active plan containing
 * today, else the next active plan to start, else the active plan that ended most
 * recently, else null.
 */
export function currentPlan<T extends PlanSpan>(plans: readonly T[], todayISO: string): T | null {
  const active = plans.filter((plan) => plan.status === "active");
  const containing = planForDate(active, todayISO);
  if (containing) return containing;
  const upcoming = active
    .filter((plan) => plan.starts_on > todayISO)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  if (upcoming[0]) return upcoming[0];
  const past = active.sort((a, b) => b.ends_on.localeCompare(a.ends_on));
  return past[0] ?? null;
}

/** The plans a blackout may be stored against: not a closed plan, which is final. */
function canHoldBlackout(plan: PlanSpan): boolean {
  return plan.status !== "closed";
}

/**
 * A blackout is stored per plan. One that spans two terms becomes one row for each
 * plan it overlaps, clipped to that plan's dates, so a winter break needs no
 * second entry. Dates no plan covers are not stored: nothing can be booked there.
 */
export function splitBlackoutAcrossPlans(
  range: { starts_on: string; ends_on: string },
  plans: readonly PlanSpan[],
): { plan_id: string; starts_on: string; ends_on: string }[] {
  return plans
    .filter(canHoldBlackout)
    .filter((plan) => rangesOverlap(plan, range))
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
    .map((plan) => ({
      plan_id: plan.id,
      starts_on: range.starts_on > plan.starts_on ? range.starts_on : plan.starts_on,
      ends_on: range.ends_on < plan.ends_on ? range.ends_on : plan.ends_on,
    }));
}
