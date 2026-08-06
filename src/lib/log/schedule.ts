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
