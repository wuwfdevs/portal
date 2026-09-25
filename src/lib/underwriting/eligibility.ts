// Placement eligibility for the redesigned schedule line
// (docs/underwriting-traffic-redesign.md §9). Pure: no Supabase import,
// colocated tests. A line says *where* a credit may air; a demand bucket
// says *how many* are owed in a period. These are the TypeScript twins of
// the SQL guard's helpers — uw_bucket_for_date() and uw_time_eligible() in
// 20260925150000_underwriting_demand_buckets.sql — and must stay in step
// with them: the planner plans with these, the database enforces with those.

import type { UwDemandBucketStatus, UwScheduleLineStatus, UwTimeMode } from "@/lib/database.types";
import { dayOfWeek, eachDate } from "./dates";

/** How close (minutes) a break's start must be to an exact-mode line's time — uw_exact_time_tolerance() in SQL. */
export const EXACT_TIME_TOLERANCE_MINUTES = 3;

export interface LineEligibilityLike {
  /** Eligible weekdays, 0=Sunday..6=Saturday; empty means any day. */
  days_of_week: number[];
  start_date: string;
  end_date: string | null;
  status: UwScheduleLineStatus;
  cancelled_from: string | null;
  time_mode: UwTimeMode;
  /** "HH:MM" or "HH:MM:SS", station-local wall clock. */
  preferred_time: string | null;
  window_start: string | null;
  window_end: string | null;
  required_opportunity_key: string | null;
  max_per_day: number | null;
}

export interface BucketLike {
  id: string;
  period_start: string;
  period_end: string;
  quantity_required: number;
  status: UwDemandBucketStatus;
}

/** Inside the line's dates, not cancelled from this date on, and on an eligible weekday. */
export function isDateEligible(line: LineEligibilityLike, dateISO: string): boolean {
  if (dateISO < line.start_date) return false;
  if (line.end_date != null && dateISO > line.end_date) return false;
  if (line.status === "cancelled" && line.cancelled_from != null && dateISO >= line.cancelled_from)
    return false;
  if (line.days_of_week.length > 0 && !line.days_of_week.includes(dayOfWeek(dateISO))) return false;
  return true;
}

/**
 * The active bucket (with quantity) that a date falls in, or null when the
 * date isn't eligible or no bucket covers it — uw_bucket_for_date().
 */
export function bucketForDate<T extends BucketLike>(
  line: LineEligibilityLike,
  buckets: T[],
  dateISO: string,
): T | null {
  if (!isDateEligible(line, dateISO)) return null;
  return (
    [...buckets]
      .filter(
        (bucket) =>
          bucket.status === "active" &&
          bucket.quantity_required > 0 &&
          bucket.period_start <= dateISO &&
          bucket.period_end >= dateISO,
      )
      .sort((a, b) => a.period_start.localeCompare(b.period_start))[0] ?? null
  );
}

/** The dates inside a bucket's period a credit may air on under the line's eligibility. */
export function eligibleDatesInBucket(line: LineEligibilityLike, bucket: BucketLike): string[] {
  const dates: string[] = [];
  for (const date of eachDate(bucket.period_start, bucket.period_end)) {
    if (isDateEligible(line, date)) dates.push(date);
  }
  return dates;
}

/** "HH:MM" / "HH:MM:SS" (station-local wall clock) as minutes since midnight. */
export function minutesFromTimeString(time: string): number {
  const [hourStr, minuteStr] = time.split(":");
  return Number(hourStr) * 60 + Number(minuteStr);
}

/**
 * Does a break starting at this station-local minute, in an opportunity
 * carrying this traffic key, satisfy the line's time mode? — uw_time_eligible().
 * `any` and `preferred` never exclude; `preferred` only ranks (see the planner).
 */
export function isTimeEligible(
  line: Pick<
    LineEligibilityLike,
    "time_mode" | "preferred_time" | "window_start" | "window_end" | "required_opportunity_key"
  >,
  minutesOfDay: number,
  trafficKey: string | null,
): boolean {
  switch (line.time_mode) {
    case "any":
    case "preferred":
      return true;
    case "window": {
      if (line.window_start == null || line.window_end == null) return false;
      return (
        minutesOfDay >= minutesFromTimeString(line.window_start) &&
        minutesOfDay < minutesFromTimeString(line.window_end)
      );
    }
    case "exact": {
      if (line.preferred_time == null) return false;
      return (
        Math.abs(minutesOfDay - minutesFromTimeString(line.preferred_time)) <=
        EXACT_TIME_TOLERANCE_MINUTES
      );
    }
    case "slot":
      return trafficKey != null && trafficKey === line.required_opportunity_key;
  }
}
