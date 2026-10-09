// Pure schedule-resolution logic — no Supabase import, colocated test. Given
// a date, this is the only place that decides whether a log_schedule row
// covers it; the "Today" screen and (once it exists) rundown generation
// should both call this rather than re-deriving it.

import { dayOfWeekISO } from "@/lib/dates";
import type { LogScheduleEntryType } from "@/lib/database.types";

export interface ScheduleEntryLike {
  entry_type: LogScheduleEntryType;
  days_of_week: number[];
  start_date: string;
  end_date: string | null;
}

/**
 * Whether a schedule entry is in effect on the given ISO date (YYYY-MM-DD).
 * `days_of_week` only gates recurring entries — an override entry
 * with no days_of_week set covers every day in its date range.
 */
export function isScheduleEntryActiveOn(entry: ScheduleEntryLike, dateISO: string): boolean {
  if (entry.start_date > dateISO) return false;
  if (entry.end_date && entry.end_date < dateISO) return false;

  if (entry.entry_type === "recurring" && entry.days_of_week.length > 0) {
    const dayOfWeek = dayOfWeekISO(dateISO);
    return entry.days_of_week.includes(dayOfWeek);
  }

  return true;
}

/** A schedule entry that belongs to a program — what the "in force" rule groups by. */
export interface ProgramScheduleEntryLike extends ScheduleEntryLike {
  program_id: string;
}

/**
 * The one entry actually in force for a program on a date, out of that
 * program's entries. A one-time change (`override`) wins over the standing
 * recurring entry — that is its whole purpose (docs/log-design.md §3B:
 * date-bounded substitutions and temporary special schedules). Between two
 * one-time changes, and between two recurring entries, the later start_date
 * is the more specific, more recently added one; a remaining tie keeps the
 * earlier array position so the result is stable.
 *
 * Every screen or action that decides "what airs on this date" should come
 * through here (or `entriesInForceOn`) rather than filtering with
 * `isScheduleEntryActiveOn` alone, which says only whether an entry covers
 * a date and knows nothing about precedence.
 */
export function resolveEntryInForce<T extends ScheduleEntryLike>(
  entries: T[],
  dateISO: string,
): T | null {
  let best: T | null = null;
  for (const entry of entries) {
    if (!isScheduleEntryActiveOn(entry, dateISO)) continue;
    if (best === null || outranks(entry, best)) best = entry;
  }
  return best;
}

function outranks(candidate: ScheduleEntryLike, current: ScheduleEntryLike): boolean {
  const candidateIsChange = candidate.entry_type !== "recurring";
  const currentIsChange = current.entry_type !== "recurring";
  if (candidateIsChange !== currentIsChange) return candidateIsChange;
  return candidate.start_date > current.start_date;
}

/** One in-force entry per program on a date, across all programs' entries, in the input's order. */
export function entriesInForceOn<T extends ProgramScheduleEntryLike>(
  entries: T[],
  dateISO: string,
): T[] {
  const byProgram = new Map<string, T[]>();
  for (const entry of entries) {
    const list = byProgram.get(entry.program_id);
    if (list) list.push(entry);
    else byProgram.set(entry.program_id, [entry]);
  }
  const inForce = new Set<T>();
  for (const programEntries of byProgram.values()) {
    const winner = resolveEntryInForce(programEntries, dateISO);
    if (winner) inForce.add(winner);
  }
  return entries.filter((entry) => inForce.has(entry));
}

/** Formats a `time` column value ("HH:MM:SS") as "5:00 AM" for display. */
export function formatAirTime(airTime: string): string {
  const [hourStr, minuteStr] = airTime.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

/** The clock time a program scheduled at `airTime` for `durationMinutes` ends, formatted the same way. */
export function computeEndTime(airTime: string, durationMinutes: number): string {
  const [hourStr, minuteStr] = airTime.split(":");
  const startMinutes = Number(hourStr) * 60 + Number(minuteStr);
  const endMinutes = (startMinutes + durationMinutes) % (24 * 60);
  const hour = Math.floor(endMinutes / 60);
  const minute = endMinutes % 60;
  return formatAirTime(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
}
