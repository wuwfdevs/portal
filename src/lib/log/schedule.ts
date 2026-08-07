// Pure schedule-resolution logic — no Supabase import, colocated test. Given
// a date, this is the only place that decides whether a log_schedule row
// covers it; the "Today" screen and (once it exists) rundown generation
// should both call this rather than re-deriving it.

import type { LogScheduleEntryType } from "@/lib/database.types";

export interface ScheduleEntryLike {
  entry_type: LogScheduleEntryType;
  days_of_week: number[];
  start_date: string;
  end_date: string | null;
}

/**
 * Whether a schedule entry is in effect on the given ISO date (YYYY-MM-DD).
 * `days_of_week` only gates recurring entries — an override or holiday entry
 * with no days_of_week set covers every day in its date range.
 */
export function isScheduleEntryActiveOn(entry: ScheduleEntryLike, dateISO: string): boolean {
  if (entry.start_date > dateISO) return false;
  if (entry.end_date && entry.end_date < dateISO) return false;

  if (entry.entry_type === "recurring" && entry.days_of_week.length > 0) {
    const dayOfWeek = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
    return entry.days_of_week.includes(dayOfWeek);
  }

  return true;
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
