// What the Automated hours screen says about a window or change. Pure —
// tested in automated-hours-display.test.ts. Station time throughout.

import { formatAirTime } from "./schedule";
import { formatDateShort } from "./program-status";
import { shiftDateISO } from "./timezone";
import { stationLocalParts, timeToSeconds } from "./automated-hours";

/** "8:00 PM – 5:00 AM"; "12:00 AM" for midnight at either end. */
export function formatWindowHours(startTime: string, endTime: string): string {
  return `${formatAirTime(startTime)} – ${formatAirTime(endTime)}`;
}

/** "Oct 7 – Nov 2", or just "Oct 7" for hours with no end date. */
export function formatEffectiveRange(effectiveFrom: string, effectiveTo: string | null): string {
  return effectiveTo
    ? `${formatDateShort(effectiveFrom)} – ${formatDateShort(effectiveTo)}`
    : formatDateShort(effectiveFrom);
}

/** A change's local start and end as form values: a date and an "HH:MM" time. */
export function localFormValues(instantISO: string): { date: string; time: string } {
  const parts = stationLocalParts(instantISO);
  const hours = Math.floor(parts.seconds / 3600);
  const minutes = Math.floor((parts.seconds % 3600) / 60);
  return {
    date: parts.dateISO,
    time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
  };
}

function clock(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return formatAirTime(`${hours}:${String(minutes).padStart(2, "0")}`);
}

/**
 * When a one-time change runs, as the table says it: "Fri, Oct 2 · 5:00 –
 * 9:00 AM", "Thu, Nov 26 · all day", "Thu, Dec 24 – Fri, Jan 1 · all day",
 * or "Sat, Oct 3, 8:00 PM – Sun, Oct 4, 1:00 AM". A change that starts and
 * ends at midnight covers whole days; its end is exclusive, so the last day
 * shown is the one before it.
 */
export function formatChangeWhen(startsAt: string, endsAt: string): string {
  const start = stationLocalParts(startsAt);
  const end = stationLocalParts(endsAt);
  if (start.seconds === 0 && end.seconds === 0) {
    const lastDay = shiftDateISO(end.dateISO, -1);
    return lastDay === start.dateISO
      ? `${formatDateShort(start.dateISO, true)} · all day`
      : `${formatDateShort(start.dateISO, true)} – ${formatDateShort(lastDay, true)} · all day`;
  }
  const endsSameDay =
    end.dateISO === start.dateISO ||
    (end.seconds === 0 && shiftDateISO(start.dateISO, 1) === end.dateISO);
  if (endsSameDay) {
    const from = clock(start.seconds);
    const to = clock(end.seconds);
    const range =
      from.slice(-2) === to.slice(-2) ? `${from.slice(0, -3)} – ${to}` : `${from} – ${to}`;
    return `${formatDateShort(start.dateISO, true)} · ${range}`;
  }
  return `${formatDateShort(start.dateISO, true)}, ${clock(start.seconds)} – ${formatDateShort(end.dateISO, true)}, ${clock(end.seconds)}`;
}

export interface ProgramAiringLike {
  programName: string;
  entry_type: string;
  days_of_week: number[];
  air_time: string;
  duration_minutes: number;
  start_date: string;
  end_date: string | null;
}

const WEEK_MINUTES = 7 * 24 * 60;

/** [start, end) minute ranges on a Sunday-based week, wrapped copies included so overlap checks needn't care about the week's edge. */
function weekRanges(
  days: number[],
  startMinutes: number,
  lengthMinutes: number,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const allDays = days.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : days;
  for (const day of allDays) {
    const start = day * 1440 + startMinutes;
    ranges.push([start, start + lengthMinutes]);
    ranges.push([start + WEEK_MINUTES, start + WEEK_MINUTES + lengthMinutes]);
  }
  return ranges;
}

/**
 * The programs on the air during a weekly window — the "Programs in these
 * hours" column. Recurring schedule entries still in effect on `todayISO`
 * whose airings overlap the window on any of its days, in the order they
 * first come on.
 */
export function programsInWindow(
  window: { daysOfWeek: number[]; startTime: string; endTime: string },
  entries: ProgramAiringLike[],
  todayISO: string,
): string[] {
  const start = Math.floor(timeToSeconds(window.startTime) / 60);
  let end = Math.floor(timeToSeconds(window.endTime) / 60);
  if (end <= start) end += 1440;
  const windowRanges = weekRanges(window.daysOfWeek, start, end - start);

  const firstOn = new Map<string, number>();
  for (const entry of entries) {
    if (entry.entry_type !== "recurring") continue;
    if (entry.end_date !== null && entry.end_date < todayISO) continue;
    const airStart = Math.floor(timeToSeconds(entry.air_time) / 60);
    const airing = weekRanges(entry.days_of_week, airStart, entry.duration_minutes);
    for (const [a0, a1] of airing) {
      for (const [w0, w1] of windowRanges) {
        if (a0 < w1 && w0 < a1) {
          const at = Math.max(a0, w0) % WEEK_MINUTES;
          const known = firstOn.get(entry.programName);
          if (known === undefined || at < known) firstOn.set(entry.programName, at);
        }
      }
    }
  }
  return [...firstOn.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
}
