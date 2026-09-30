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
//   * Never in the past (a break before todayISO, or one already started
//     by nowISO), never in a rundown that is live or submitted (freeze.ts —
//     the log belongs to the host from the moment the broadcast starts),
//     never in a break this contract already holds a credit in, never in a break whose last item
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
//   * Copy follows the contract's rotation (rotation.ts): the run's new
//     units are sequenced in air order against the contract's existing
//     placements, whichever line those belong to, each taking the message
//     after the one aired just before it; copy tied to another flight is
//     never used. The execution side re-walks the whole contract afterwards.

import type { LogRundownStatus, UwCopyApprovalStatus } from "@/lib/database.types";
import { automationBlockFor } from "./freeze";
import { servesLine, walkRotation, type RotationCopy, type RotationSlot } from "./rotation";

export interface CandidateBreak {
  breakId: string;
  airDate: string;
  /** Minutes since midnight, station-local. */
  minutesOfDay: number;
  /** The break's start, as a UTC instant — with nowISO, whether it has already gone by. */
  scheduledAt: string;
  /** The break's rundown's status — a live or submitted rundown is frozen to automation. */
  rundownStatus: LogRundownStatus;
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
  /** The schedule line this copy is dedicated to, or null (rotation.ts's servesLine()). */
  lineId?: string | null;
  /** uw_copy.created_at — the rotation's cycle order. */
  createdAt: string;
}

/** One of the contract's existing placements, any line, as the rotation sees it: fixed in the sequence the run's new units slot into. */
export interface ExistingSequenceEntry {
  scheduledAt: string;
  copyId: string;
  /** The placement's schedule line — which rotation cycle it advances (rotation.ts's rotationGroup()). */
  lineId?: string | null;
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
  /** Every active placement of the whole contract (not just this line), for the copy rotation. */
  contractSequence: ExistingSequenceEntry[];
  makegoodsAwaitingSlot: AwaitingMakegood[];
  /** The order's per-day cap, or null for none. */
  maxPerDay: number | null;
  /** Ranks candidates within a day; null means earliest first. */
  preferredTimeMinutes: number | null;
  underwriterId: string;
  /** The underwriter's industry (uw_industry_categories id) — same-industry adjacency is refused. */
  categoryId: string | null;
  lineFlightId: string | null;
  /** The schedule line being filled — decides which copy serves it (rotation.ts's servesLine()). */
  lineId?: string | null;
  /** From the contract's separation policy; null when none applies. */
  separationMinutes: number | null;
  todayISO: string;
  /** The current instant, for the past-break half of the freeze rule. */
  nowISO: string;
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

export function copyEligible(
  copy: CopyCandidate,
  brk: Pick<CandidateBreak, "remainingSeconds" | "airDate">,
  lineFlightId: string | null,
  lineId: string | null = null,
  copies: CopyCandidate[] = [copy],
): boolean {
  if (copy.approvalStatus !== "approved") return false;
  if (copy.durationSeconds == null || copy.durationSeconds > brk.remainingSeconds) return false;
  if (copy.effectiveFrom > brk.airDate) return false;
  if (copy.effectiveTo != null && copy.effectiveTo < brk.airDate) return false;
  if (copy.flightId != null && copy.flightId !== lineFlightId) return false;
  if (!servesLine(copy, lineId, copies)) return false;
  return true;
}

export function toRotationCopy(copy: CopyCandidate): RotationCopy {
  return {
    id: copy.id,
    approvalStatus: copy.approvalStatus,
    durationSeconds: copy.durationSeconds,
    effectiveFrom: copy.effectiveFrom,
    effectiveTo: copy.effectiveTo,
    flightId: copy.flightId,
    lineId: copy.lineId,
    createdAt: copy.createdAt,
  };
}

/**
 * Gives each planned unit its message by walking the contract's existing
 * placements and the run's units together in air order (rotation.ts).
 * Existing placements are fixed here — the execution side's rebalance
 * re-sequences them afterwards — and a unit nothing eligible fits is
 * dropped (the caller already checked one fits, so this is a guard).
 */
export function assignCopyByRotation(
  items: (Omit<PlanItem, "copyId"> & { scheduledAt: string; roomSeconds: number })[],
  copies: CopyCandidate[],
  sequence: ExistingSequenceEntry[],
  lineFlightId: string | null,
  lineId: string | null = null,
): { items: PlanItem[]; dropped: Omit<PlanItem, "copyId">[] } {
  const slots: RotationSlot[] = [
    ...sequence.map((entry, index) => ({
      id: `existing-${index}`,
      scheduledAt: entry.scheduledAt,
      airDate: entry.scheduledAt.slice(0, 10),
      lineFlightId: null,
      lineId: entry.lineId ?? null,
      copyId: entry.copyId,
      fixed: true,
      roomSeconds: 0,
    })),
    ...items.map((item) => ({
      id: `unit-${item.breakId}`,
      scheduledAt: item.scheduledAt,
      airDate: item.airDate,
      lineFlightId,
      lineId,
      copyId: null,
      fixed: false,
      roomSeconds: item.roomSeconds,
    })),
  ];
  const copyByUnit = new Map(
    walkRotation(copies.map(toRotationCopy), slots).map((change) => [change.id, change.copyId]),
  );
  const assigned: PlanItem[] = [];
  const dropped: Omit<PlanItem, "copyId">[] = [];
  for (const item of items) {
    const copyId = copyByUnit.get(`unit-${item.breakId}`);
    const rest: Omit<PlanItem, "copyId"> = {
      breakId: item.breakId,
      airDate: item.airDate,
      reason: item.reason,
      bucketId: item.bucketId,
      ...(item.makegoodId !== undefined ? { makegoodId: item.makegoodId } : {}),
    };
    if (copyId === undefined) dropped.push(rest);
    else assigned.push({ ...rest, copyId });
  }
  return { items: assigned, dropped };
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
  const usable = breaks.filter(
    (brk) =>
      brk.airDate >= demand.todayISO &&
      brk.remainingSeconds > 0 &&
      automationBlockFor(brk, demand.nowISO) === null,
  );
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

  type PendingItem = Omit<PlanItem, "copyId"> & { scheduledAt: string; roomSeconds: number };
  const pending: PendingItem[] = [];
  const unplaceable: UnplaceableUnit[] = [];

  /** Tries to place one unit on one date; returns the item (message assigned later, by rotation) or the reason it couldn't. */
  const tryDate = (date: string): PendingItem | UnplaceableReason => {
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
      if (
        !copies.some((copy) => copyEligible(copy, brk, demand.lineFlightId, demand.lineId, copies))
      ) {
        why = "no_eligible_copy";
        continue;
      }
      state.used++;
      state.times.push(brk.minutesOfDay);
      state.usedBreakIds.add(brk.breakId);
      return {
        breakId: brk.breakId,
        airDate: date,
        reason: "fresh",
        bucketId: brk.bucketId,
        scheduledAt: brk.scheduledAt,
        roomSeconds: brk.remainingSeconds,
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
      pending.push({
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
        pending.push({ ...result, bucketId: bucket.bucketId });
        shortfall--;
        progress = true;
      }
    }
    for (let i = 0; i < shortfall; i++)
      unplaceable.push({ bucketId: bucket.bucketId, reason: "fresh", why });
  }

  const { items, dropped } = assignCopyByRotation(
    pending,
    copies,
    demand.contractSequence,
    demand.lineFlightId,
    demand.lineId,
  );
  for (const unit of dropped) {
    unplaceable.push({
      bucketId: unit.bucketId,
      reason: unit.reason,
      makegoodId: unit.makegoodId,
      why: "no_eligible_copy",
    });
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
