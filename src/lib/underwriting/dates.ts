// Calendar-date helpers shared by the demand compiler, eligibility, and the
// planner. Dates are ISO calendar dates in the station's own calendar — an
// air_date is already a date, so there is no timezone math here. Broadcast
// weeks are Monday–Sunday (every WUWF order on file starts on a Monday and
// FPM's grid columns are Mondays).

import {
  addDaysISO,
  dayOfWeekISO,
  daysBetweenISO,
  eachDateISO,
  isValidDateISO as isStrictDateISO,
  weekStartISO,
} from "@/lib/dates";

function toUTC(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00Z`);
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const addDays = addDaysISO;

/** 0=Sunday..6=Saturday, matching log_schedule.days_of_week. */
export const dayOfWeek = dayOfWeekISO;

/** The Monday on or before the date — the broadcast week's key. */
export const weekStartOf = weekStartISO;

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

export const isValidDateISO = isStrictDateISO;

export const eachDate = eachDateISO;

/** Whole days between two dates (end − start). */
export const daysBetween = daysBetweenISO;

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
