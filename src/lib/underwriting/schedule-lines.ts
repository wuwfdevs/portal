// Pure occurrence math for uw_contract_schedule_lines (docs/underwriting-
// design.md §2/§10) — the real shape of a WUWF insertion order (e.g. "Monday
// ~7:49am x 26 weeks"). No Supabase import, colocated test.
//
// The reference case: the real Autumn Beck Blackledge agreement has four
// weekly recurring lines (Monday, Tuesday, Wednesday+Thursday) over the same
// 26-week campaign — 4 lines x 26 weeks = 104 expected contractual
// occurrences, matching the insertion order's own spot count exactly. See
// supabase/seed.sql's Underwriting section for the seeded version of this
// exact contract.

export interface ScheduleLineOccurrenceLike {
  /** 0=Sunday..6=Saturday, matching log_schedule.days_of_week's own convention. */
  days_of_week: number[];
  start_date: string;
  end_date: string | null;
  /** Set only for a non-day-of-week-recurring obligation (e.g. "12 credits a month") — see the module comment on expectedOccurrenceCount. */
  occurrence_count_override: number | null;
}

/** Counts how many days between startDateISO and endDateISO (inclusive) fall on one of daysOfWeek. */
export function countWeekdayOccurrences(daysOfWeek: number[], startDateISO: string, endDateISO: string): number {
  if (daysOfWeek.length === 0) return 0;
  const start = new Date(`${startDateISO}T00:00:00Z`);
  const end = new Date(`${endDateISO}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  const daySet = new Set(daysOfWeek);
  let count = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (daySet.has(cursor.getUTCDay())) count++;
  }
  return count;
}

/**
 * Expected total occurrences over one schedule line's full date range.
 * `occurrence_count_override` wins outright — the escape hatch for a looser
 * obligation ("12 credits a month during Morning Edition") that doesn't fit
 * clean day-of-week math (docs/underwriting-design.md §7). Without an
 * override and no end_date, the commitment is open-ended and has no fixed
 * total — returns null rather than a misleading number.
 */
export function expectedOccurrenceCount(line: ScheduleLineOccurrenceLike): number | null {
  if (line.occurrence_count_override != null) return line.occurrence_count_override;
  if (line.end_date == null) return null;
  return countWeekdayOccurrences(line.days_of_week, line.start_date, line.end_date);
}

/** Sums expected occurrences across every schedule line under a contract. Null (not a partial sum) if any line is open-ended, since the total itself is then undefined. */
export function sumExpectedOccurrences(lines: ScheduleLineOccurrenceLike[]): number | null {
  let total = 0;
  for (const line of lines) {
    const count = expectedOccurrenceCount(line);
    if (count == null) return null;
    total += count;
  }
  return total;
}

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A short human-readable summary of a schedule line's recurrence, for display — never raw days_of_week integers. */
export function describeScheduleLineRecurrence(line: { days_of_week: number[]; target_time: string | null }): string {
  const days = [...line.days_of_week].sort((a, b) => a - b).map((d) => DAY_LABEL[d] ?? `day ${d}`);
  const dayText = days.length === 0 ? "no days set" : days.join("/");
  return line.target_time ? `${dayText} ~${line.target_time}` : dayText;
}
