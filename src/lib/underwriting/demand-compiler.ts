// The demand compiler (docs/underwriting-traffic-redesign.md §9): turns the
// way a traffic staffer enters an order's schedule — fixed days, N a week,
// N a month, every N weeks, explicit dates, a week grid, a total over a
// range — into explicit demand buckets, the one representation the
// scheduler and the SQL guard read. Pure: no Supabase import, colocated
// tests built from the real orders in fixtures/insertion-orders.ts.
//
// A bucket is "quantity credits owed inside [periodStart, periodEnd]".
// Eligibility (weekdays, time mode, program, pool, per-day cap) is the
// line's, not the bucket's: a weekly quota's bucket is the whole Monday
// week, and the line's days_of_week say which of its days count. A bucket
// with quantity 0 is a real row (an agency's dark week) so the screen shows
// the week was ordered empty rather than forgotten.
//
// Periods are clipped to the line's own start/end — a line starting on a
// Wednesday gets a first bucket Wed–Sun, flagged `partial` so the review
// can say it is counted at the full weekly quantity, never prorated.

import type { UwScheduleEntryKind } from "@/lib/database.types";
import {
  addDays,
  dayOfWeek,
  eachDate,
  isValidDateISO,
  monthEndOf,
  monthLabel,
  monthStartOf,
  shortDate,
  weekStartOf,
} from "./dates";

export type EntrySpec =
  /** count_per_day credits on each of the line's days_of_week, start..end. */
  | { kind: "fixed_days"; count_per_day: number }
  /** quantity credits in each Monday week, on any of the line's days. */
  | { kind: "weekly_quota"; quantity: number }
  /** quantity credits in each calendar month. */
  | { kind: "monthly_quota"; quantity: number }
  /** quantity credits in one week out of every interval_weeks, counting from the week of anchor (default: the line's start). */
  | { kind: "every_n_weeks"; interval_weeks: number; quantity: number; anchor?: string }
  /** The listed dates, each with its own quantity — one-day buckets. */
  | { kind: "explicit_dates"; dates: { date: string; quantity: number }[] }
  /** An agency grid: one quantity per Monday week, zeros included. */
  | { kind: "week_grid"; weeks: { week_start: string; quantity: number }[] }
  /** quantity credits anywhere in start..end — "52 any time this year". */
  | { kind: "range_total"; quantity: number };

export interface CompileInput {
  start_date: string;
  end_date: string | null;
  /** Eligible weekdays; empty means any. A week/month with no eligible day yields no bucket. */
  days_of_week: number[];
}

export interface CompiledBucket {
  periodStart: string;
  periodEnd: string;
  quantity: number;
  sourceLabel: string;
  /** Clipped by the line's own start/end (a partial week or month). */
  partial: boolean;
}

export interface CompileOptions {
  /** For an open-ended line (no end_date): the last date to compile through. Without it an open-ended recurring line compiles to nothing. */
  through?: string;
}

const ENTRY_KINDS: UwScheduleEntryKind[] = [
  "fixed_days",
  "weekly_quota",
  "monthly_quota",
  "every_n_weeks",
  "explicit_dates",
  "week_grid",
  "range_total",
];

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Validates a stored entry_spec (jsonb) back into an EntrySpec, or null when malformed. */
export function parseEntrySpec(raw: unknown): EntrySpec | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const spec = raw as Record<string, unknown>;
  if (typeof spec.kind !== "string" || !ENTRY_KINDS.includes(spec.kind as UwScheduleEntryKind))
    return null;
  const kind = spec.kind as UwScheduleEntryKind;
  switch (kind) {
    case "fixed_days":
      return isPositiveInt(spec.count_per_day) ? { kind, count_per_day: spec.count_per_day } : null;
    case "weekly_quota":
    case "monthly_quota":
    case "range_total":
      return isPositiveInt(spec.quantity) ? { kind, quantity: spec.quantity } : null;
    case "every_n_weeks":
      if (!isPositiveInt(spec.interval_weeks) || !isPositiveInt(spec.quantity)) return null;
      if (spec.anchor != null && (typeof spec.anchor !== "string" || !isValidDateISO(spec.anchor)))
        return null;
      return {
        kind,
        interval_weeks: spec.interval_weeks,
        quantity: spec.quantity,
        ...(typeof spec.anchor === "string" ? { anchor: spec.anchor } : {}),
      };
    case "explicit_dates": {
      if (!Array.isArray(spec.dates)) return null;
      const dates: { date: string; quantity: number }[] = [];
      for (const entry of spec.dates) {
        if (entry == null || typeof entry !== "object" || Array.isArray(entry)) return null;
        const { date, quantity } = entry as Record<string, unknown>;
        if (typeof date !== "string" || !isValidDateISO(date) || !isPositiveInt(quantity))
          return null;
        dates.push({ date, quantity });
      }
      return { kind, dates };
    }
    case "week_grid": {
      if (!Array.isArray(spec.weeks)) return null;
      const weeks: { week_start: string; quantity: number }[] = [];
      for (const entry of spec.weeks) {
        if (entry == null || typeof entry !== "object" || Array.isArray(entry)) return null;
        const { week_start, quantity } = entry as Record<string, unknown>;
        if (
          typeof week_start !== "string" ||
          !isValidDateISO(week_start) ||
          !isNonNegativeInt(quantity)
        )
          return null;
        weeks.push({ week_start, quantity });
      }
      return { kind, weeks };
    }
  }
}

function clip(
  periodStart: string,
  periodEnd: string,
  input: CompileInput,
  end: string,
): { start: string; end: string; partial: boolean } | null {
  const start = periodStart < input.start_date ? input.start_date : periodStart;
  const finish = periodEnd > end ? end : periodEnd;
  if (finish < start) return null;
  return { start, end: finish, partial: start !== periodStart || finish !== periodEnd };
}

function hasEligibleDay(input: CompileInput, start: string, end: string): boolean {
  if (input.days_of_week.length === 0) return true;
  for (const date of eachDate(start, end)) {
    if (input.days_of_week.includes(dayOfWeek(date))) return true;
  }
  return false;
}

/**
 * Compiles an entry spec into buckets, in date order. Never overlapping,
 * never outside the line's dates (explicit dates and grid weeks outside
 * them are dropped — reviewScheduleLine() flags them separately from the
 * raw spec).
 */
export function compileDemandBuckets(
  spec: EntrySpec,
  input: CompileInput,
  options: CompileOptions = {},
): CompiledBucket[] {
  const end = input.end_date ?? options.through ?? null;
  const buckets: CompiledBucket[] = [];

  switch (spec.kind) {
    case "fixed_days": {
      if (end == null) return [];
      for (const date of eachDate(input.start_date, end)) {
        if (input.days_of_week.length > 0 && !input.days_of_week.includes(dayOfWeek(date)))
          continue;
        buckets.push({
          periodStart: date,
          periodEnd: date,
          quantity: spec.count_per_day,
          sourceLabel: shortDate(date),
          partial: false,
        });
      }
      return buckets;
    }
    case "weekly_quota":
    case "every_n_weeks": {
      if (end == null) return [];
      const interval = spec.kind === "every_n_weeks" ? spec.interval_weeks : 1;
      const anchor =
        spec.kind === "every_n_weeks" && spec.anchor
          ? weekStartOf(spec.anchor)
          : weekStartOf(input.start_date);
      // Walk every week from the line's first week; only weeks a whole
      // number of intervals from the anchor carry demand.
      for (
        let weekStart = weekStartOf(input.start_date);
        weekStart <= end;
        weekStart = addDays(weekStart, 7)
      ) {
        const weeksFromAnchor = Math.round(
          (Date.parse(`${weekStart}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) /
            (7 * 86_400_000),
        );
        if (((weeksFromAnchor % interval) + interval) % interval !== 0) continue;
        const clipped = clip(weekStart, addDays(weekStart, 6), input, end);
        if (!clipped || !hasEligibleDay(input, clipped.start, clipped.end)) continue;
        buckets.push({
          periodStart: clipped.start,
          periodEnd: clipped.end,
          quantity: spec.quantity,
          sourceLabel: `week of ${shortDate(weekStart)}`,
          partial: clipped.partial,
        });
      }
      return buckets;
    }
    case "monthly_quota": {
      if (end == null) return [];
      for (
        let monthStart = monthStartOf(input.start_date);
        monthStart <= end;
        monthStart = addDays(monthEndOf(monthStart), 1)
      ) {
        const clipped = clip(monthStart, monthEndOf(monthStart), input, end);
        if (!clipped || !hasEligibleDay(input, clipped.start, clipped.end)) continue;
        buckets.push({
          periodStart: clipped.start,
          periodEnd: clipped.end,
          quantity: spec.quantity,
          sourceLabel: monthLabel(monthStart),
          partial: clipped.partial,
        });
      }
      return buckets;
    }
    case "explicit_dates": {
      const byDate = new Map<string, number>();
      for (const entry of spec.dates) {
        if (entry.date < input.start_date || (end != null && entry.date > end)) continue;
        byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.quantity);
      }
      for (const [date, quantity] of [...byDate.entries()].sort()) {
        buckets.push({
          periodStart: date,
          periodEnd: date,
          quantity,
          sourceLabel: shortDate(date),
          partial: false,
        });
      }
      return buckets;
    }
    case "week_grid": {
      const byWeek = new Map<string, number>();
      for (const entry of spec.weeks) byWeek.set(weekStartOf(entry.week_start), entry.quantity);
      for (const [weekStart, quantity] of [...byWeek.entries()].sort()) {
        const clipped = clip(weekStart, addDays(weekStart, 6), input, end ?? addDays(weekStart, 6));
        if (!clipped) continue;
        buckets.push({
          periodStart: clipped.start,
          periodEnd: clipped.end,
          quantity,
          sourceLabel: `week of ${shortDate(weekStart)}`,
          partial: clipped.partial,
        });
      }
      return buckets;
    }
    case "range_total": {
      if (end == null) return [];
      if (end < input.start_date) return [];
      buckets.push({
        periodStart: input.start_date,
        periodEnd: end,
        quantity: spec.quantity,
        sourceLabel: `${shortDate(input.start_date)} – ${shortDate(end)}`,
        partial: false,
      });
      return buckets;
    }
  }
}

/** Sum of every bucket's quantity — the line's expected total over its whole run. */
export function totalQuantity(buckets: { quantity: number }[]): number {
  return buckets.reduce((sum, bucket) => sum + bucket.quantity, 0);
}

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeDays(daysOfWeek: number[]): string {
  const sorted = [...new Set(daysOfWeek)].sort((a, b) => a - b);
  if (sorted.length === 0 || sorted.length === 7) return "any day";
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) return "each weekday";
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return "Saturday or Sunday";
  return sorted.map((d) => DAY_LABEL[d] ?? `day ${d}`).join("/");
}

/**
 * How the order sells it, in words — "1 credit each Wed", "4 credits a
 * week, each weekday", "1 credit every other week, any day", "28 credits
 * on 12 listed dates", "540 credits across 48 listed weeks".
 */
export function describeEntrySpec(spec: EntrySpec, daysOfWeek: number[], unit = "credit"): string {
  const n = (count: number) => `${count} ${unit}${count === 1 ? "" : "s"}`;
  switch (spec.kind) {
    case "fixed_days":
      return `${n(spec.count_per_day)} ${daysOfWeek.length === 0 ? "each day" : `each ${describeDays(daysOfWeek)}`}`;
    case "weekly_quota":
      return `${n(spec.quantity)} a week, ${describeDays(daysOfWeek)}`;
    case "monthly_quota":
      return `${n(spec.quantity)} a month, ${describeDays(daysOfWeek)}`;
    case "every_n_weeks":
      return `${n(spec.quantity)} every ${spec.interval_weeks === 2 ? "other week" : `${spec.interval_weeks} weeks`}, ${describeDays(daysOfWeek)}`;
    case "explicit_dates":
      return `${n(totalQuantity(spec.dates))} on ${spec.dates.length} listed date${spec.dates.length === 1 ? "" : "s"}`;
    case "week_grid":
      return `${n(totalQuantity(spec.weeks))} across ${spec.weeks.length} listed week${spec.weeks.length === 1 ? "" : "s"}, ${describeDays(daysOfWeek)}`;
    case "range_total":
      return `${n(spec.quantity)} over the whole run, ${describeDays(daysOfWeek)}`;
  }
}
