// Pure schedule-overlap check — no Supabase import, colocated test. Advisory:
// the schedule editor shows what would air at the same time as an entry being
// edited; nothing here blocks a save. Day/date conventions follow
// `isScheduleEntryActiveOn` (schedule.ts): only a recurring entry with days
// gates by weekday, so an empty list, or an override entry, covers
// every day in its date range.

import { parseTimeToMinutes } from "@/lib/time-of-day";
import type { LogScheduleEntryType } from "@/lib/database.types";

export interface OverlapCandidate {
  /** Present when editing an existing entry; that row is never reported. */
  id?: string;
  entry_type: LogScheduleEntryType;
  days_of_week: number[];
  start_date: string;
  end_date: string | null;
  /** "HH:MM" or "HH:MM:SS". */
  air_time: string;
  duration_minutes: number;
}

export interface OverlapOther extends OverlapCandidate {
  id: string;
  programName: string;
}

export interface ScheduleOverlap {
  entryId: string;
  programName: string;
  /** Weekdays (0 = Sunday) of the candidate's airings that collide, ascending. */
  days: number[];
  /** The other entry's air time, as stored. */
  airTime: string;
  durationMinutes: number;
}

const DAY = 1440;
const WEEK = 7 * DAY;

/** The weekdays an entry airs on, resolved the way `isScheduleEntryActiveOn` does. */
export function effectiveDays(
  entry: Pick<OverlapCandidate, "entry_type" | "days_of_week">,
): number[] {
  if (entry.entry_type === "recurring" && entry.days_of_week.length > 0) {
    return [...new Set(entry.days_of_week)].sort((a, b) => a - b);
  }
  return [0, 1, 2, 3, 4, 5, 6];
}

function dateRangesOverlap(a: OverlapCandidate, b: OverlapCandidate): boolean {
  if (a.end_date && a.end_date < b.start_date) return false;
  if (b.end_date && b.end_date < a.start_date) return false;
  return true;
}

/**
 * The other entries that would air at the same time as `candidate`: an
 * overlapping weekday, time-of-day range (an entry running past midnight
 * carries into the next day) and date range. Touching ranges (one ends the
 * minute the next starts) don't conflict.
 */
export function findScheduleOverlaps(
  candidate: OverlapCandidate,
  others: OverlapOther[],
): ScheduleOverlap[] {
  if (!(candidate.duration_minutes > 0)) return [];
  const candidateDays = effectiveDays(candidate);
  const candidateStart = parseTimeToMinutes(candidate.air_time);
  const result: ScheduleOverlap[] = [];

  for (const other of others) {
    if (candidate.id && other.id === candidate.id) continue;
    if (!(other.duration_minutes > 0)) continue;
    if (!dateRangesOverlap(candidate, other)) continue;
    const otherStart = parseTimeToMinutes(other.air_time);
    const otherDays = effectiveDays(other);
    const days: number[] = [];

    for (const a of candidateDays) {
      const aStart = a * DAY + candidateStart;
      const aEnd = aStart + candidate.duration_minutes;
      const collides = otherDays.some((b) => {
        const bStart = b * DAY + otherStart;
        const bEnd = bStart + other.duration_minutes;
        // Compare across the week boundary too (Sunday night into Monday).
        return [-WEEK, 0, WEEK].some((shift) => aStart < bEnd + shift && bStart + shift < aEnd);
      });
      if (collides) days.push(a);
    }

    if (days.length > 0) {
      result.push({
        entryId: other.id,
        programName: other.programName,
        days,
        airTime: other.air_time,
        durationMinutes: other.duration_minutes,
      });
    }
  }
  return result;
}
