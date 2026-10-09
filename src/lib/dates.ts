/**
 * Calendar-date arithmetic on bare `YYYY-MM-DD` strings — the one place the
 * portal does it. A calendar date has no timezone, so every function here
 * works in UTC on a date anchored at noon and never reasons about an offset;
 * the station's own zone (where "today" is) lives in `log/timezone.ts`.
 *
 * Validation is strict: a value must round-trip, so "2026-02-30" (which
 * `Date` happily rolls to March 2) is rejected rather than reaching Postgres
 * as a server error.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toUTC(dateISO: string): Date {
  return new Date(`${dateISO}T12:00:00Z`);
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Whether a value is a real `YYYY-MM-DD` calendar date (no rolling over: Feb 30 is not one). */
export function isValidDateISO(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const parsed = toUTC(value);
  return !Number.isNaN(parsed.getTime()) && toISO(parsed) === value;
}

/** Adds (or, negative, subtracts) whole days to a calendar date. */
export function addDaysISO(dateISO: string, days: number): string {
  const date = toUTC(dateISO);
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
}

/** 0 = Sunday .. 6 = Saturday, matching `log_schedule.days_of_week`. */
export function dayOfWeekISO(dateISO: string): number {
  return toUTC(dateISO).getUTCDay();
}

/** The Monday on or before the date — the broadcast week's key. */
export function weekStartISO(dateISO: string): string {
  return addDaysISO(dateISO, -((dayOfWeekISO(dateISO) + 6) % 7));
}

/** Every date from `startISO` through `endISO`, inclusive; empty when `endISO` is earlier. */
export function* eachDateISO(startISO: string, endISO: string): Generator<string> {
  for (
    let cursor = toUTC(startISO);
    toISO(cursor) <= endISO;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    yield toISO(cursor);
  }
}

/** Whole days between two dates (end − start). */
export function daysBetweenISO(startISO: string, endISO: string): number {
  return Math.round((toUTC(endISO).getTime() - toUTC(startISO).getTime()) / 86_400_000);
}
