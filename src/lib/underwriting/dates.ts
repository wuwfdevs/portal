// Calendar-date helpers shared by the demand compiler, eligibility, and the
// planner. Dates are ISO calendar dates in the station's own calendar — an
// air_date is already a date, so there is no timezone math here. Broadcast
// weeks are Monday–Sunday (every WUWF order on file starts on a Monday and
// FPM's grid columns are Mondays).

function toUTC(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00Z`);
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(dateISO: string, days: number): string {
  const date = toUTC(dateISO);
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
}

/** 0=Sunday..6=Saturday, matching log_schedule.days_of_week. */
export function dayOfWeek(dateISO: string): number {
  return toUTC(dateISO).getUTCDay();
}

/** The Monday on or before the date — the broadcast week's key. */
export function weekStartOf(dateISO: string): string {
  const dow = dayOfWeek(dateISO);
  const offset = dow === 0 ? 6 : dow - 1;
  return addDays(dateISO, -offset);
}

/** The first of the date's calendar month. */
export function monthStartOf(dateISO: string): string {
  return `${dateISO.slice(0, 7)}-01`;
}

/** The last day of the date's calendar month. */
export function monthEndOf(dateISO: string): string {
  const date = toUTC(monthStartOf(dateISO));
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return toISO(date);
}

export function isValidDateISO(dateISO: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateISO) && !Number.isNaN(toUTC(dateISO).getTime());
}

export function* eachDate(startISO: string, endISO: string): Generator<string> {
  for (
    let cursor = toUTC(startISO);
    toISO(cursor) <= endISO;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    yield toISO(cursor);
  }
}

/** Whole days between two dates (end − start). */
export function daysBetween(startISO: string, endISO: string): number {
  return Math.round((toUTC(endISO).getTime() - toUTC(startISO).getTime()) / 86_400_000);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sep 28" — a short label for a date. */
export function shortDate(dateISO: string): string {
  const month = Number.parseInt(dateISO.slice(5, 7), 10);
  const day = Number.parseInt(dateISO.slice(8, 10), 10);
  return `${MONTHS[month - 1] ?? "?"} ${day}`;
}

/** "September 2026". */
export function monthLabel(dateISO: string): string {
  const full = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = Number.parseInt(dateISO.slice(5, 7), 10);
  return `${full[month - 1] ?? "?"} ${dateISO.slice(0, 4)}`;
}
