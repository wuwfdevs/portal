// Inventory selection for the auto-fill scheduler
// (docs/underwriting-traffic-redesign.md §4). Pure — no Supabase import,
// colocated tests. Given a schedule line's open demand periods
// (lib/underwriting/demand.ts), what it already holds, the real Log breaks
// it may use, and its linked copy, this decides which break gets which
// unit. The execution side (lib/underwriting/auto-fill.ts) writes every
// planned item through log_place_underwriting_credit(), which re-checks the
// same limits under a row lock — this module plans, the database enforces.
//
// Rules, in the order they are applied:
//   * Never in the past (a break before todayISO), never in a break this
//     contract already holds a credit in, never in a break whose last item
//     is the same underwriter or the same industry (the reference
//     agreement's "does not run adjacent to a business with similar
//     services or products").
//   * Makegoods awaiting a slot drain first: a missed unit is overdue.
//   * A period is filled to its quantity, never past it; a day is filled to
//     the period's day cap, never past it; two units on one day go to two
//     different breaks (a same-day pair — Choral Society's "2 AM Drive each"
//     — is two distinct opportunities, never one break twice).
//   * A contract with a min_minutes separation policy keeps its own
//     same-day credits at least that far apart.
//   * "N a week" spreads across the week's eligible days rather than
//     stacking the first ones (brief §6's unspecified-distribution default).
//   * Within a day, the break closest to the line's target_time wins; with
//     no target, the earliest.
//   * Copy rotates by least use; copy tied to another flight is never used.

import type { UwCopyApprovalStatus } from "@/lib/database.types";
import type { DemandPeriod } from "./demand";

export interface CandidateBreak {
  breakId: string;
  airDate: string;
  /** Minutes since midnight, station-local. */
  minutesOfDay: number;
  remainingSeconds: number;
  lastItemUnderwriterId: string | null;
  lastItemCategory: string | null;
  /** This contract already has a credit in this break (any line). */
  holdsThisContract: boolean;
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
  periodStart: string;
  airDate: string;
  minutesOfDay: number;
  isMakegood: boolean;
}

export interface AwaitingMakegood {
  id: string;
  /** The period the missed unit belonged to — where the replacement is attributed. */
  periodStart: string | null;
}

export interface SelectionDemand {
  periods: DemandPeriod[];
  existingPlacements: ExistingPlacement[];
  makegoodsAwaitingSlot: AwaitingMakegood[];
  underwriterId: string;
  category: string | null;
  targetTimeMinutes: number | null;
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
  periodStart: string;
}

export type UnplaceableReason =
  "no_inventory" | "no_eligible_copy" | "adjacency" | "separation" | "day_cap" | "already_in_break";

export interface UnplaceableUnit {
  periodStart: string;
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
 * placements come back as existingPlacements and every period reads full.
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
      if (demand.targetTimeMinutes != null) {
        const da = Math.abs(a.minutesOfDay - demand.targetTimeMinutes);
        const db = Math.abs(b.minutesOfDay - demand.targetTimeMinutes);
        if (da !== db) return da - db;
      }
      return a.minutesOfDay - b.minutesOfDay || a.breakId.localeCompare(b.breakId);
    });
  }

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
  const tryDate = (date: string, dayCap: number): PlanItem | UnplaceableReason => {
    const state = stateFor(date);
    if (state.used >= dayCap) return "day_cap";
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
        (demand.category != null && brk.lastItemCategory === demand.category)
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
        periodStart: "",
      };
    }
    return why;
  };

  const openDates = (period: DemandPeriod) =>
    period.eligibleDates.filter((date) => date >= demand.todayISO);

  // Makegoods first: any eligible date of the line, earliest first, one
  // unit each, attributed to the period they replace.
  const allDates = [...new Set(demand.periods.flatMap(openDates))].sort();
  const capFor = new Map<string, number>();
  for (const period of demand.periods)
    for (const date of period.eligibleDates) capFor.set(date, period.maxPerDay);
  for (const makegood of demand.makegoodsAwaitingSlot) {
    let placed = false;
    let why: UnplaceableReason = "no_inventory";
    for (const date of allDates) {
      const result = tryDate(date, capFor.get(date) ?? 1);
      if (typeof result === "string") {
        if (result !== "day_cap" && result !== "no_inventory") why = result;
        else if (why === "no_inventory") why = result;
        continue;
      }
      items.push({
        ...result,
        reason: "makegood",
        makegoodId: makegood.id,
        periodStart: makegood.periodStart ?? date,
      });
      placed = true;
      break;
    }
    if (!placed)
      unplaceable.push({
        periodStart: makegood.periodStart ?? "",
        reason: "makegood",
        makegoodId: makegood.id,
        why,
      });
  }

  // Then each period's fresh shortfall, spread across its open days.
  for (const period of demand.periods) {
    const fresh = demand.existingPlacements.filter(
      (p) => p.periodStart === period.periodStart && !p.isMakegood,
    ).length;
    let shortfall = period.quantity - fresh;
    if (shortfall <= 0) continue;

    const dates = openDates(period).filter((date) => stateFor(date).used < period.maxPerDay);
    const withInventory = dates.filter((date) => (byDate.get(date) ?? []).length > 0);
    // Spread across days that actually have inventory; fall back to every
    // open day only to report why nothing could be placed.
    const order = [
      ...spreadDates(withInventory, shortfall),
      ...withInventory.filter((d) => !spreadDates(withInventory, shortfall).includes(d)),
    ];
    let why: UnplaceableReason = withInventory.length === 0 ? "no_inventory" : "day_cap";

    // First pass: at most one unit per chosen day; second pass: extra units
    // where the day cap allows (a 2-a-day order).
    for (let pass = 0; pass < period.maxPerDay && shortfall > 0; pass++) {
      for (const date of order) {
        if (shortfall <= 0) break;
        const result = tryDate(date, period.maxPerDay);
        if (typeof result === "string") {
          if (result !== "day_cap") why = result;
          continue;
        }
        items.push({ ...result, periodStart: period.periodStart });
        shortfall--;
      }
    }
    for (let i = 0; i < shortfall; i++)
      unplaceable.push({ periodStart: period.periodStart, reason: "fresh", why });
  }

  items.sort((a, b) => a.airDate.localeCompare(b.airDate) || a.breakId.localeCompare(b.breakId));
  return { items, unplaceable };
}

/**
 * Dates that still need Log rundowns generated before a plan could fill
 * them: for every period with a fresh shortfall (or any makegood awaiting a
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

  const wanted: string[] = [];
  let makegoods = demand.makegoodsAwaitingSlot.length;
  for (const period of demand.periods) {
    const fresh = demand.existingPlacements.filter(
      (p) => p.periodStart === period.periodStart && !p.isMakegood,
    ).length;
    const need = Math.max(0, period.quantity - fresh) + makegoods;
    makegoods = 0;
    if (need === 0) continue;
    const open = period.eligibleDates.filter(
      (date) => date >= demand.todayISO && (placedPerDay.get(date) ?? 0) < period.maxPerDay,
    );
    const bare = open.filter((date) => !haveInventory.has(date));
    const covered = open.length - bare.length;
    const stillNeeded = Math.max(0, need - covered);
    for (const date of spreadDates(bare, stillNeeded))
      if (!wanted.includes(date)) wanted.push(date);
  }
  return wanted.sort().slice(0, limit);
}
