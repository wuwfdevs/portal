// A package books itself — pure, no Supabase, no React.
// docs/bookings-design.md §18.2. The estimate's package lines already say
// everything a booking needs (hours per labor class, units per pool); this
// turns them plus an event date into the full set of bookings, runs the
// booking rule (scheduling.ts's checkBooking, §6.4) on each, and either
// returns the bookings or an exception in plain language with the nearest
// alternatives. It never returns a partial or mismatched plan.

import { dayOfWeekISO } from "@/lib/dates";
import { shiftDateISO } from "@/lib/log/timezone";
import { roundCents } from "@/lib/money";
import { parseTimeToMinutes } from "@/lib/time-of-day";
import type { BkPricingTreatment } from "@/lib/database.types";
import {
  checkBooking,
  formatWindow,
  toHHMM,
  windowsFor,
  type BookingRefusal,
  type CalendarState,
  type HoursByClass,
  type ResourceWindow,
} from "./scheduling";

export interface PlanLine {
  quantity: number;
  /** Per unit of the line. */
  labor_hours: HoursByClass;
  /** Per unit of the line, by pool id. */
  resource_units: Record<string, number>;
}

export interface PlanWindow {
  start: string;
  end: string;
}

export interface PlanInput {
  date: string;
  /** The primary window staff picked; null means first available. */
  window?: PlanWindow | null;
  lines: readonly PlanLine[];
  treatment: BkPricingTreatment;
  partnerId: string | null;
}

export interface PlannedBooking {
  pool_id: string;
  date: string;
  window_start: string;
  window_end: string;
  hours: HoursByClass;
  /** The booking that carries the lines' hours. */
  primary: boolean;
}

export interface PlanAlternative {
  date: string;
  window_start: string;
  window_end: string;
  label: string;
}

export type PlanFailureCode = "no_resource" | "mismatch" | "refused";

export type BookingPlan =
  | { ok: true; bookings: PlannedBooking[]; warnings: string[] }
  | {
      ok: false;
      code: PlanFailureCode;
      /** A sentence for the screen, with no model vocabulary. */
      message: string;
      /** The resource that couldn't be booked, for the term report's refusals by resource. */
      poolId: string | null;
      alternatives: PlanAlternative[];
    };

/** Units per pool across the lines: Σ quantity × units per unit; zero rows dropped. */
export function poolDemand(lines: readonly PlanLine[]): Record<string, number> {
  const demand: Record<string, number> = {};
  for (const line of lines) {
    for (const [poolId, units] of Object.entries(line.resource_units)) {
      const total = Number(units) * Number(line.quantity);
      if (total > 0) demand[poolId] = roundCents((demand[poolId] ?? 0) + total);
    }
  }
  return demand;
}

/** Hours per class across the lines: Σ quantity × hours per unit. */
export function planHours(lines: readonly PlanLine[]): HoursByClass {
  const hours: HoursByClass = {};
  for (const line of lines) {
    for (const [classId, perUnit] of Object.entries(line.labor_hours)) {
      const total = Number(perUnit) * Number(line.quantity);
      if (total > 0) hours[classId] = roundCents((hours[classId] ?? 0) + total);
    }
  }
  return hours;
}

function poolName(state: Pick<CalendarState, "pools">, poolId: string): string {
  return state.pools.find((pool) => pool.id === poolId)?.name ?? "That resource";
}

function overlapMinutes(a: PlanWindow, b: PlanWindow): number {
  const start = Math.max(parseTimeToMinutes(a.start), parseTimeToMinutes(b.start));
  const end = Math.min(parseTimeToMinutes(a.end), parseTimeToMinutes(b.end));
  return Math.max(0, end - start);
}

/** A refusal in the words production staff use: no pool, reserve, class or treatment. */
export function plainRefusal(
  refusal: BookingRefusal,
  context: { poolName: string; date: string; asked?: number },
): string {
  switch (refusal.reason) {
    case "outside_plan":
      return `${context.date} is outside the current term.`;
    case "no_resource":
      return `${context.poolName} isn't set up for this term.`;
    case "blacked_out":
      return `WUWF isn't taking partner work then: ${refusal.blackout.reason}.`;
    case "held":
      return `WUWF has ${refusal.hold.label} then.`;
    case "reserved":
      return `${context.poolName} is reserved for ${refusal.block.partner_name} until ${refusal.until}.`;
    case "window_taken":
      return `${context.poolName} is already booked at that time.`;
    case "day_full":
      return `Staff time is full that day (${trim(refusal.remaining)} hours left${
        context.asked ? `, this needs ${trim(context.asked)}` : ""
      }).`;
    case "reserve_exhausted":
      return "The staff time WUWF sets aside for university work is used up this term.";
    case "open_capacity_exhausted":
      return "There isn't enough open production time left this term for this.";
  }
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : String(roundCents(value));
}

type Attempt =
  | { ok: true; bookings: PlannedBooking[]; warnings: string[] }
  | { ok: false; code: PlanFailureCode; message: string; poolId: string | null };

interface PoolPlan {
  anchorId: string;
  poolIds: string[];
  demand: Record<string, number>;
}

function planPools(lines: readonly PlanLine[], state: CalendarState): PoolPlan | null {
  const demand = poolDemand(lines);
  const poolIds = Object.keys(demand);
  if (poolIds.length === 0) return null;
  // The anchor is the choosing pool (more than one window) with the most units, else any
  // pool with a window of its own, else the first.
  const resourceOf = (poolId: string) => state.resources.find((r) => r.pool_id === poolId);
  const choosing = poolIds.filter((id) => (resourceOf(id)?.windows.length ?? 0) > 1);
  const single = poolIds.filter((id) => (resourceOf(id)?.windows.length ?? 0) === 1);
  const pickMost = (ids: string[]) =>
    ids.reduce((best, id) => (demand[id]! > demand[best]! ? id : best), ids[0]!);
  const anchorId =
    choosing.length > 0 ? pickMost(choosing) : single.length > 0 ? pickMost(single) : poolIds[0]!;
  return { anchorId, poolIds, demand };
}

/** One date and one primary window: every pool's booking, then the rule on each. */
function attempt(
  input: PlanInput,
  state: CalendarState,
  pools: PoolPlan,
  date: string,
  primary: PlanWindow,
): Attempt {
  const hours = planHours(input.lines);
  const bookings: PlannedBooking[] = [];
  for (const poolId of pools.poolIds) {
    const resource = state.resources.find((r) => r.pool_id === poolId);
    if (!resource) {
      return {
        ok: false,
        code: "no_resource",
        message: `${poolName(state, poolId)} isn't set up for this term.`,
        poolId,
      };
    }
    let window: PlanWindow;
    if (poolId === pools.anchorId || resource.windows.length === 0) {
      // The anchor takes the primary window; a pool with no windows of its own has no
      // independent choice and attaches to it.
      window = primary;
    } else {
      const own = resource.windows;
      const best = own.reduce<{ window: ResourceWindow | null; overlap: number }>(
        (found, candidate) => {
          const overlap = overlapMinutes(primary, {
            start: candidate.start,
            end: candidate.end,
          });
          const exact = candidate.start === primary.start && candidate.end === primary.end;
          const score = exact ? Number.MAX_SAFE_INTEGER : overlap;
          return score > found.overlap ? { window: candidate, overlap: score } : found;
        },
        { window: null, overlap: 0 },
      );
      if (!best.window) {
        return {
          ok: false,
          code: "mismatch",
          message: `${poolName(state, poolId)} and ${poolName(
            state,
            pools.anchorId,
          )} can't share ${formatWindow(primary.start, primary.end)}: ${poolName(
            state,
            poolId,
          )} is only available ${own.map((w) => formatWindow(w.start, w.end)).join(", ")}.`,
          poolId,
        };
      }
      window = { start: best.window.start, end: best.window.end };
    }
    bookings.push({
      pool_id: poolId,
      date,
      window_start: window.start,
      window_end: window.end,
      hours: poolId === pools.anchorId ? hours : {},
      primary: poolId === pools.anchorId,
    });
  }
  const warnings: string[] = [];
  for (const booking of bookings) {
    const check = checkBooking(
      {
        pool_id: booking.pool_id,
        date,
        window_start: booking.window_start,
        window_end: booking.window_end,
        hours: booking.hours,
        treatment: input.treatment,
        partnerId: input.partnerId,
      },
      state,
    );
    if (!check.ok) {
      return {
        ok: false,
        code: "refused",
        message: plainRefusal(check.refusal, {
          poolName: poolName(state, booking.pool_id),
          date,
          asked: Object.values(booking.hours).reduce((total, h) => total + Number(h), 0),
        }),
        poolId: booking.pool_id,
      };
    }
    warnings.push(...check.warnings);
  }
  // Primary first, so the hours lead.
  bookings.sort((a, b) => Number(b.primary) - Number(a.primary));
  return { ok: true, bookings, warnings };
}

function candidateWindows(pools: PoolPlan, state: CalendarState): ResourceWindow[] {
  return windowsFor(state.resources.find((r) => r.pool_id === pools.anchorId));
}

/**
 * The booking plan for an event date (§18.2). With no window picked, the
 * anchor's windows are tried in order and the first whole plan that passes
 * wins; with one picked, only that. A failure carries a plain-language message
 * for the first reason the asked date can't work, and the nearest alternatives.
 */
export function buildBookingPlan(input: PlanInput, state: CalendarState): BookingPlan {
  const pools = planPools(input.lines, state);
  if (!pools) return { ok: true, bookings: [], warnings: [] };

  const picked: PlanWindow | null = input.window
    ? { start: toHHMM(input.window.start), end: toHHMM(input.window.end) }
    : null;
  const windows: PlanWindow[] = picked
    ? [picked]
    : candidateWindows(pools, state).map((w) => ({ start: w.start, end: w.end }));

  let firstFailure: Extract<Attempt, { ok: false }> | null = null;
  for (const window of windows) {
    const result = attempt(input, state, pools, input.date, window);
    if (result.ok) return { ok: true, bookings: result.bookings, warnings: result.warnings };
    // A mismatch is a property of the window pair, not of the day; prefer reporting a real refusal.
    if (!firstFailure || (firstFailure.code === "mismatch" && result.code !== "mismatch")) {
      firstFailure = result;
    }
  }
  const failure = firstFailure ?? {
    ok: false as const,
    code: "refused" as const,
    message: "That date can't be booked.",
    poolId: null,
  };
  return {
    ok: false,
    code: failure.code,
    message: failure.message,
    poolId: failure.poolId,
    alternatives: nearestAlternatives(input, state, pools),
  };
}

function isWeekend(dateISO: string): boolean {
  const day = dayOfWeekISO(dateISO);
  return day === 0 || day === 6;
}

/** The next dates and windows where the whole plan passes, nearest the asked date first. */
export function nearestAlternatives(
  input: PlanInput,
  state: CalendarState,
  pools: PoolPlan | null = planPools(input.lines, state),
  limit = 3,
  searchDays = 21,
): PlanAlternative[] {
  if (!pools) return [];
  const windows = candidateWindows(pools, state);
  const found: PlanAlternative[] = [];
  const offsets: number[] = [0];
  for (let day = 1; day <= searchDays; day += 1) offsets.push(day, -day);
  // A weekday request is offered weekdays; a weekend event is offered any day.
  const weekdayOnly = !isWeekend(input.date);
  for (const offset of offsets) {
    const date = shiftDateISO(input.date, offset);
    if (date < state.plan.starts_on || date > state.plan.ends_on) continue;
    if (weekdayOnly && isWeekend(date)) continue;
    for (const window of windows) {
      if (
        offset === 0 &&
        input.window &&
        window.start === toHHMM(input.window.start) &&
        window.end === toHHMM(input.window.end)
      ) {
        continue;
      }
      const result = attempt(input, state, pools, date, { start: window.start, end: window.end });
      if (result.ok) {
        found.push({
          date,
          window_start: window.start,
          window_end: window.end,
          label: window.label,
        });
        if (found.length >= limit) return found;
        break; // one window per date is enough to offer
      }
    }
  }
  return found;
}

/**
 * The "Time of day" choices a request form offers: the distinct windows of
 * the pools that actually offer a choice this term, by label, first-seen order.
 */
export function timeOfDayOptions(
  state: Pick<CalendarState, "resources" | "pools">,
  poolIds?: readonly string[],
): { key: string; label: string; start: string; end: string }[] {
  const seen = new Set<string>();
  const options: { key: string; label: string; start: string; end: string }[] = [];
  for (const resource of state.resources) {
    if (poolIds && !poolIds.includes(resource.pool_id)) continue;
    if (resource.windows.length < 2) continue;
    for (const window of resource.windows) {
      const key = `${window.start}-${window.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({ key, label: window.label, start: window.start, end: window.end });
    }
  }
  return options;
}
