// Inventory selection for the auto-fill scheduler
// (docs/underwriting-traffic-redesign.md §9). Pure — no Supabase import,
// colocated tests. Given a schedule line's open demand buckets, what it
// already holds, the real Log breaks it may use (already filtered to the
// line's eligibility by log_list_placeable_rundown_breaks()), and its linked
// copy, this decides which break gets which unit. The execution side
// (lib/underwriting/auto-fill.ts) writes every planned item through
// log_place_underwriting_credit(), which re-checks the same limits under a
// row lock — this module plans, the database enforces.
//
// Hard rules (the order's, or the station's):
//   * Never in the past (a break before todayISO), never in a break this
//     contract already holds a credit in, never in a break whose last item
//     is the same underwriter or the same industry (the reference
//     agreement's "does not run adjacent to a business with similar
//     services or products").
//   * A bucket is filled to its quantity, never past it. Two units on one
//     day go to two different breaks. When the order states a per-day cap
//     (max_per_day) it is respected; when it doesn't, several credits a day
//     are fine — there is no global one-per-day doctrine.
//   * A contract with a min_minutes separation policy keeps its own
//     same-day credits at least that far apart.
//   * Makegoods awaiting a slot drain first: a missed unit is overdue.
// Preferences (the scheduler's, never contractual):
//   * Even distribution: a bucket's units spread across its eligible days
//     with inventory, least-loaded day first, so "10 a week" lands as two a
//     day rather than ten on Monday.
//   * Within a day, the break closest to preferred_time wins; with no
//     preference, the earliest.
//   * Copy rotates by least use; copy tied to another flight is never used.

import type { UwCopyApprovalStatus } from "@/lib/database.types";

export interface CandidateBreak {
  breakId: string;
  airDate: string;
  /** Minutes since midnight, station-local. */
  minutesOfDay: number;
  remainingSeconds: number;
  lastItemUnderwriterId: string | null;
  lastItemCategoryId: string | null;
  /** This contract already has a credit in this break (any line). */
  holdsThisContract: boolean;
  /** The active bucket this break would consume, from log_list_placeable_rundown_breaks(). */
  bucketId: string;
}

export interface CopyCandidate {
  id: string;
  approvalStatus: UwCopyApprovalStatus;
  durationSeconds: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** The flight this copy is linked to on the contract, or null for contract-wide copy. */
  flightId: string | null;
  existingUsageCount: number;
}

export interface ExistingPlacement {
  bucketId: string;
  airDate: string;
  minutesOfDay: number;
  isMakegood: boolean;
}

export interface AwaitingMakegood {
  id: string;
  /** The bucket the missed unit belonged to — where the replacement is attributed. */
  bucketId: string | null;
}

export interface BucketDemand {
  bucketId: string;
  periodStart: string;
  periodEnd: string;
  quantity: number;
  /** Dates in the bucket a credit may air on under the line's eligibility. */
  eligibleDates: string[];
}

export interface SelectionDemand {
  buckets: BucketDemand[];
  existingPlacements: ExistingPlacement[];
  makegoodsAwaitingSlot: AwaitingMakegood[];
  /** The order's per-day cap, or null for none. */
  maxPerDay: number | null;
  /** Ranks candidates within a day; null means earliest first. */
  preferredTimeMinutes: number | null;
  underwriterId: string;
  /** The underwriter's industry (uw_industry_categories id) — same-industry adjacency is refused. */
  categoryId: string | null;
  lineFlightId: string | null;
  /** From the contract's separation policy; null when none applies. */
  separationMinutes: number | null;
  todayISO: string;
}

export interface PlanItem {
  breakId: string;
  copyId: string;
  airDate: string;
  reason: "fresh" | "makegood";
  makegoodId?: string;
  bucketId: string;
}

export type UnplaceableReason =
  "no_inventory" | "no_eligible_copy" | "adjacency" | "separation" | "day_cap" | "already_in_break";

export interface UnplaceableUnit {
  bucketId: string;
  reason: "fresh" | "makegood";
  makegoodId?: string;
  /** The most useful of the reasons the eligible dates were passed over — no_inventory when there was nothing to consider at all. */
  why: UnplaceableReason;
}

export interface SelectionPlan {
  items: PlanItem[];
  unplaceable: UnplaceableUnit[];
}

interface DayState {
  used: number;
  times: number[];
  usedBreakIds: Set<string>;
}

function copyEligible(
  copy: CopyCandidate,
  brk: CandidateBreak,
  lineFlightId: string | null,
): boolean {
  if (copy.approvalStatus !== "approved") return false;
  if (copy.durationSeconds == null || copy.durationSeconds > brk.remainingSeconds) return false;
  if (copy.effectiveFrom > brk.airDate) return false;
  if (copy.effectiveTo != null && copy.effectiveTo < brk.airDate) return false;
  if (copy.flightId != null && copy.flightId !== lineFlightId) return false;
  return true;
}

/**
 * Picks `count` dates from `dates` (already in order) spread evenly across
 * the list — three from seven eligible days lands on the 1st, 4th and 7th,
 * not the first three. Returns all of them when count >= dates.length.
 */
export function spreadDates(dates: string[], count: number): string[] {
  if (count >= dates.length) return [...dates];
  if (count <= 0) return [];
  if (count === 1) return [dates[0]!];
  const picked: string[] = [];
  const step = (dates.length - 1) / (count - 1);
  for (let i = 0; i < count; i++) {
    const index = Math.round(i * step);
    const date = dates[index]!;
    if (!picked.includes(date)) picked.push(date);
  }
  return picked;
}

/**
 * Plans breaks for a line's open demand. Deterministic for the same inputs;
 * re-running it after its items were placed plans nothing new, because the
 * placements come back as existingPlacements and every bucket reads full.
 */
export function planInventorySelection(
  breaks: CandidateBreak[],
  demand: SelectionDemand,
  copies: CopyCandidate[],
): SelectionPlan {
  const usable = breaks.filter((brk) => brk.airDate >= demand.todayISO && brk.remainingSeconds > 0);
  const byDate = new Map<string, CandidateBreak[]>();
  for (const brk of usable) {
    const list = byDate.get(brk.airDate) ?? [];
    list.push(brk);
    byDate.set(brk.airDate, list);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => {
      if (demand.preferredTimeMinutes != null) {
        const da = Math.abs(a.minutesOfDay - demand.preferredTimeMinutes);
        const db = Math.abs(b.minutesOfDay - demand.preferredTimeMinutes);
        if (da !== db) return da - db;
      }
      return a.minutesOfDay - b.minutesOfDay || a.breakId.localeCompare(b.breakId);
    });
  }
  const cap = demand.maxPerDay ?? Number.POSITIVE_INFINITY;

  const dayState = new Map<string, DayState>();
  const stateFor = (date: string): DayState => {
    let state = dayState.get(date);
    if (!state) {
      state = { used: 0, times: [], usedBreakIds: new Set() };
      dayState.set(date, state);
    }
    return state;
  };
  for (const placement of demand.existingPlacements) {
    const state = stateFor(placement.airDate);
    state.used++;
    state.times.push(placement.minutesOfDay);
  }

  const usage = new Map(copies.map((copy) => [copy.id, copy.existingUsageCount]));
  const items: PlanItem[] = [];
  const unplaceable: UnplaceableUnit[] = [];

  /** Tries to place one unit on one date; returns the item or the reason it couldn't. */
  const tryDate = (date: string): PlanItem | UnplaceableReason => {
    const state = stateFor(date);
    if (state.used >= cap) return "day_cap";
    const candidates = byDate.get(date) ?? [];
    if (candidates.length === 0) return "no_inventory";
    let why: UnplaceableReason = "no_inventory";
    for (const brk of candidates) {
      if (state.usedBreakIds.has(brk.breakId) || brk.holdsThisContract) {
        why = "already_in_break";
        continue;
      }
      if (
        brk.lastItemUnderwriterId === demand.underwriterId ||
        (demand.categoryId != null && brk.lastItemCategoryId === demand.categoryId)
      ) {
        why = "adjacency";
        continue;
      }
      if (
        demand.separationMinutes != null &&
        state.times.some((t) => Math.abs(t - brk.minutesOfDay) < demand.separationMinutes!)
      ) {
        why = "separation";
        continue;
      }
      const eligible = copies
        .filter((copy) => copyEligible(copy, brk, demand.lineFlightId))
        .sort((a, b) => usage.get(a.id)! - usage.get(b.id)! || a.id.localeCompare(b.id));
      if (eligible.length === 0) {
        why = "no_eligible_copy";
        continue;
      }
      const copy = eligible[0]!;
      usage.set(copy.id, (usage.get(copy.id) ?? 0) + 1);
      state.used++;
      state.times.push(brk.minutesOfDay);
      state.usedBreakIds.add(brk.breakId);
      return {
        breakId: brk.breakId,
        copyId: copy.id,
        airDate: date,
        reason: "fresh",
        bucketId: brk.bucketId,
      };
    }
    return why;
  };

  const openDates = (bucket: BucketDemand) =>
    bucket.eligibleDates.filter((date) => date >= demand.todayISO);

  // Makegoods first: any eligible date of the line, earliest first, one
  // unit each, attributed to the bucket they replace.
  const allDates = [...new Set(demand.buckets.flatMap(openDates))].sort();
  for (const makegood of demand.makegoodsAwaitingSlot) {
    let placed = false;
    let why: UnplaceableReason = "no_inventory";
    for (const date of allDates) {
      const result = tryDate(date);
      if (typeof result === "string") {
        if (result !== "day_cap" && result !== "no_inventory") why = result;
        else if (why === "no_inventory") why = result;
        continue;
      }
      items.push({
        ...result,
        reason: "makegood",
        makegoodId: makegood.id,
        bucketId: makegood.bucketId ?? result.bucketId,
      });
      placed = true;
      break;
    }
    if (!placed)
      unplaceable.push({
        bucketId: makegood.bucketId ?? "",
        reason: "makegood",
        makegoodId: makegood.id,
        why,
      });
  }

  // Then each bucket's fresh shortfall, spread across its open days:
  // one pass places at most one unit per chosen day; further passes add a
  // unit to the least-loaded days until the bucket is full or nothing
  // more can be placed.
  for (const bucket of demand.buckets) {
    const fresh = demand.existingPlacements.filter(
      (p) => p.bucketId === bucket.bucketId && !p.isMakegood,
    ).length;
    let shortfall = bucket.quantity - fresh;
    if (shortfall <= 0) continue;

    const dates = openDates(bucket).filter((date) => stateFor(date).used < cap);
    const withInventory = dates.filter((date) => (byDate.get(date) ?? []).length > 0);
    const spread = spreadDates(withInventory, shortfall);
    const order = [...spread, ...withInventory.filter((d) => !spread.includes(d))];
    let why: UnplaceableReason = withInventory.length === 0 ? "no_inventory" : "day_cap";

    let progress = true;
    while (shortfall > 0 && progress) {
      progress = false;
      // Least-loaded day first within a pass, so a second pass over a
      // 10-a-week order adds to Monday and Tuesday before stacking Monday.
      const pass = [...order].sort(
        (a, b) => stateFor(a).used - stateFor(b).used || order.indexOf(a) - order.indexOf(b),
      );
      for (const date of pass) {
        if (shortfall <= 0) break;
        const result = tryDate(date);
        if (typeof result === "string") {
          if (result !== "day_cap") why = result;
          continue;
        }
        items.push({ ...result, bucketId: bucket.bucketId });
        shortfall--;
        progress = true;
      }
    }
    for (let i = 0; i < shortfall; i++)
      unplaceable.push({ bucketId: bucket.bucketId, reason: "fresh", why });
  }

  items.sort((a, b) => a.airDate.localeCompare(b.airDate) || a.breakId.localeCompare(b.breakId));
  return { items, unplaceable };
}

/**
 * Dates that still need Log rundowns generated before a plan could fill
 * them: for every bucket with a fresh shortfall (or any makegood awaiting a
 * slot), the open eligible dates that currently have no candidate break at
 * all, spread the same way the planner spreads. In date order, capped at
 * `limit` — the execution side asks for exactly its shortfall.
 */
export function datesNeedingInventory(
  demand: SelectionDemand,
  breaks: CandidateBreak[],
  limit: number,
): string[] {
  if (limit <= 0) return [];
  const haveInventory = new Set(
    breaks.filter((brk) => brk.airDate >= demand.todayISO).map((brk) => brk.airDate),
  );
  const placedPerDay = new Map<string, number>();
  for (const p of demand.existingPlacements)
    placedPerDay.set(p.airDate, (placedPerDay.get(p.airDate) ?? 0) + 1);
  const cap = demand.maxPerDay ?? Number.POSITIVE_INFINITY;

  const wanted: string[] = [];
  let makegoods = demand.makegoodsAwaitingSlot.length;
  for (const bucket of demand.buckets) {
    const fresh = demand.existingPlacements.filter(
      (p) => p.bucketId === bucket.bucketId && !p.isMakegood,
    ).length;
    const need = Math.max(0, bucket.quantity - fresh) + makegoods;
    makegoods = 0;
    if (need === 0) continue;
    const open = bucket.eligibleDates.filter(
      (date) => date >= demand.todayISO && (placedPerDay.get(date) ?? 0) < cap,
    );
    const bare = open.filter((date) => !haveInventory.has(date));
    const covered = open.length - bare.length;
    const stillNeeded = Math.max(0, need - covered);
    for (const date of spreadDates(bare, stillNeeded))
      if (!wanted.includes(date)) wanted.push(date);
  }
  return wanted.sort().slice(0, limit);
}
