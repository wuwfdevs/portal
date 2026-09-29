// Pure presentation logic for the Programs screens — no Supabase import,
// colocated test. Programs are Log's one entry point for clocks: a clock is
// reached through the program that airs on it, so the list has to say, per
// program, whether it is on a real clock, still on the shared placeholder, or
// not scheduled at all.

import { isScheduleEntryActiveOn, type ScheduleEntryLike } from "@/lib/log/schedule";
import { shiftDateISO } from "@/lib/log/timezone";

/**
 * The shared placeholder clock every program without a real network clock is
 * scheduled against (20260806170000_log_schedule_completeness_fixes.sql).
 * Matched by name because that migration seeds exactly one row with it.
 */
export const PLACEHOLDER_CLOCK_NAME = "Unspecified (awaiting network clock)";

export function isPlaceholderClockName(name: string): boolean {
  return name.trim().toLowerCase() === PLACEHOLDER_CLOCK_NAME.toLowerCase();
}

export type ProgramScheduleStatus = "on_real_clock" | "needs_clock" | "not_scheduled";

export const STATUS_LABEL: Record<ProgramScheduleStatus, string> = {
  on_real_clock: "On a real clock",
  needs_clock: "Needs a clock",
  not_scheduled: "Not scheduled",
};

export interface ProgramEntryLike {
  clockTemplateName: string;
  start_date: string;
  end_date: string | null;
}

/**
 * A program's status from its schedule entries. Entries that have already
 * ended don't count; ones that start later do (a schedule entered ahead of
 * time is still a schedule). Any live placeholder entry makes the program
 * "needs a clock" even if another entry of it is on a real one — the
 * placeholder is the work still to do.
 */
export function deriveProgramStatus(
  entries: ProgramEntryLike[],
  todayISO: string,
): ProgramScheduleStatus {
  const live = entries.filter((entry) => entry.end_date === null || entry.end_date >= todayISO);
  if (live.length === 0) return "not_scheduled";
  return live.some((entry) => isPlaceholderClockName(entry.clockTemplateName))
    ? "needs_clock"
    : "on_real_clock";
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Mon–Fri", "Sat", "Mon, Wed, Fri", or "Every day"; an empty list means every day, as in log_schedule. */
export function formatDaysOfWeek(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 0 || sorted.length === 7) return "Every day";
  if (sorted.length === 1) return DAY_SHORT[sorted[0]!] ?? "";
  const contiguous = sorted.every((day, index) => index === 0 || day === sorted[index - 1]! + 1);
  if (contiguous && sorted.length >= 3) {
    return `${DAY_SHORT[sorted[0]!]}–${DAY_SHORT[sorted[sorted.length - 1]!]}`;
  }
  return sorted.map((day) => DAY_SHORT[day]).join(", ");
}

/** 240 → "4 h", 90 → "1 h 30 min", 45 → "45 min". */
export function formatDurationMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** The next date on or after `fromISO` an entry airs, or null within the horizon (a lapsed or far-future entry). */
export function nextAiringDate(
  entry: ScheduleEntryLike,
  fromISO: string,
  horizonDays = 400,
): string | null {
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const dateISO = shiftDateISO(fromISO, offset);
    if (entry.end_date && dateISO > entry.end_date) return null;
    if (isScheduleEntryActiveOn(entry, dateISO)) return dateISO;
  }
  return null;
}

export interface WeekDay {
  dateISO: string;
  /** Index into Sun..Sat. */
  dayOfWeek: number;
  /** Air times ("HH:MM:SS"), earliest first, of every entry airing that day. */
  airTimes: string[];
}

/** Monday through Sunday of the week containing `todayISO`, each with the air times of the entries that air that day. */
export function buildWeekStrip(
  entries: Array<ScheduleEntryLike & { air_time: string }>,
  todayISO: string,
): WeekDay[] {
  const todayDow = new Date(`${todayISO}T12:00:00Z`).getUTCDay();
  const mondayOffset = todayDow === 0 ? -6 : 1 - todayDow;
  const monday = shiftDateISO(todayISO, mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const dateISO = shiftDateISO(monday, index);
    const airTimes = entries
      .filter((entry) => isScheduleEntryActiveOn(entry, dateISO))
      .map((entry) => entry.air_time)
      .sort();
    return {
      dateISO,
      dayOfWeek: new Date(`${dateISO}T12:00:00Z`).getUTCDay(),
      airTimes,
    };
  });
}

/** A calendar date (YYYY-MM-DD) as "Sep 8, 2026", or "Sat, Oct 3" with `weekday` (no year, for something coming up). */
export function formatDateShort(dateISO: string, weekday = false): string {
  const date = new Date(`${dateISO}T12:00:00Z`);
  return weekday
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(date)
    : new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
}

export const CLOCK_VARIANT_LABEL: Record<string, string> = {
  weekday: "Weekday",
  weekend: "Weekend",
  program_specific: "Program-specific",
  holiday: "Holiday",
  special_event: "Special event",
};
