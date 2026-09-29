// Pure layout logic for the Programs "Week view" — no Supabase import,
// colocated test. The screen builds each day's blocks from the schedule on the
// server; this module decides where a block sits (minutes from the top of the
// visible range) and how concurrent programs share a day column.

import { computeEndTime, formatAirTime } from "@/lib/log/schedule";
import { formatDaysOfWeek } from "@/lib/log/program-status";
import { shiftDateISO } from "@/lib/log/timezone";

export const DEFAULT_START_HOUR = 5;
export const DEFAULT_END_HOUR = 24;

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAY_PLURAL = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

function dayOfWeek(dateISO: string): number {
  return new Date(`${dateISO}T12:00:00Z`).getUTCDay();
}

/** The Monday of the week (Monday..Sunday) containing `dateISO`. */
export function weekStartISO(dateISO: string): string {
  const sinceMonday = (dayOfWeek(dateISO) + 6) % 7;
  return shiftDateISO(dateISO, -sinceMonday);
}

/** The seven ISO dates, Monday through Sunday, of the week containing `dateISO`. */
export function weekDates(dateISO: string): string[] {
  const monday = weekStartISO(dateISO);
  return Array.from({ length: 7 }, (_, index) => shiftDateISO(monday, index));
}

/** Whether a string is a real YYYY-MM-DD calendar date. */
export function isValidDateISO(value: string | undefined | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** "Sep 28 – Oct 4, 2026"; the year appears on both ends only when the week spans two. */
export function formatWeekRange(mondayISO: string): string {
  const sundayISO = shiftDateISO(mondayISO, 6);
  const part = (iso: string) =>
    `${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
  const startYear = mondayISO.slice(0, 4);
  const endYear = sundayISO.slice(0, 4);
  if (startYear === endYear) return `${part(mondayISO)} – ${part(sundayISO)}, ${endYear}`;
  return `${part(mondayISO)}, ${startYear} – ${part(sundayISO)}, ${endYear}`;
}

/** Minutes after midnight for a `time` column value ("HH:MM:SS"). */
export function airTimeToMinutes(airTime: string): number {
  const [hour, minute] = airTime.split(":");
  return Number(hour) * 60 + Number(minute);
}

/** "7:00 – 9:00 AM", or "11:00 AM – 1:00 PM" when the period changes. */
export function formatTimeRange(airTime: string, durationMinutes: number): string {
  const start = formatAirTime(airTime);
  const end = computeEndTime(airTime, durationMinutes);
  const startPeriod = start.slice(-2);
  if (startPeriod === end.slice(-2)) return `${start.slice(0, -3)} – ${end}`;
  return `${start} – ${end}`;
}

/** "Saturdays" for one weekday, otherwise "Mon–Fri" and the like; overrides and holidays say so. */
export function describeEntryDays(entry: { entry_type: string; days_of_week: number[] }): string {
  if (entry.entry_type === "override") return "Override";
  if (entry.entry_type === "holiday") return "Holiday";
  const days = [...new Set(entry.days_of_week)];
  if (days.length === 1) return DAY_PLURAL[days[0]!] ?? formatDaysOfWeek(days);
  return formatDaysOfWeek(days);
}

export interface DayEntryLike {
  id: string;
  startMinutes: number;
  durationMinutes: number;
}

/**
 * The hour range the grid shows: 5 AM to midnight by default, widened at the
 * top only when some entry starts before 5 AM. The end never moves — a block
 * that runs past midnight is clipped there (see layoutDayBlocks).
 */
export function visibleHourRange(entries: Array<{ startMinutes: number }>): {
  startHour: number;
  endHour: number;
} {
  let startHour = DEFAULT_START_HOUR;
  for (const entry of entries) {
    startHour = Math.min(startHour, Math.max(0, Math.floor(entry.startMinutes / 60)));
  }
  return { startHour, endHour: DEFAULT_END_HOUR };
}

export interface PositionedBlock {
  id: string;
  /** Minutes below the top of the visible range. */
  topMinutes: number;
  /** Visible minutes, after clipping at the end of the range. */
  heightMinutes: number;
  /** Zero-based lane within a cluster of overlapping blocks. */
  lane: number;
  /** How many lanes that cluster needs; the block is 1/laneCount of the column wide. */
  laneCount: number;
  /** True when the entry runs past the end of the range and was cut off. */
  clipped: boolean;
}

/**
 * Positions one day's entries. Concurrent entries are split into lanes so
 * they sit side by side: overlapping blocks form a cluster, each takes the
 * first lane free at its start, and the whole cluster shares one lane count.
 * A block running past `endHour` (midnight by default) is clipped there, not
 * wrapped onto the next day — the next day's column is that day's own
 * schedule, and an entry that carried over from the night before is not drawn.
 */
export function layoutDayBlocks(
  entries: DayEntryLike[],
  startHour = DEFAULT_START_HOUR,
  endHour = DEFAULT_END_HOUR,
): PositionedBlock[] {
  const rangeStart = startHour * 60;
  const rangeEnd = endHour * 60;

  const items = entries
    .map((entry) => {
      const start = Math.max(entry.startMinutes, rangeStart);
      const end = Math.min(entry.startMinutes + entry.durationMinutes, rangeEnd);
      return {
        id: entry.id,
        start,
        end,
        clipped: entry.startMinutes + entry.durationMinutes > rangeEnd,
      };
    })
    .filter((item) => item.end > item.start)
    .sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));

  const result: PositionedBlock[] = [];
  let cluster: Array<{ item: (typeof items)[number]; lane: number }> = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const laneCount = laneEnds.length;
    for (const { item, lane } of cluster) {
      result.push({
        id: item.id,
        topMinutes: item.start - rangeStart,
        heightMinutes: item.end - item.start,
        lane,
        laneCount,
        clipped: item.clipped,
      });
    }
    cluster = [];
    laneEnds = [];
    clusterEnd = -Infinity;
  };

  for (const item of items) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    cluster.push({ item, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length > 0) flush();

  return result;
}

/** "5 AM", "12 PM", "12 AM" for the gutter (hour 24 is midnight). */
export function formatHourLabel(hour: number): string {
  const normalized = hour % 24;
  const period = normalized < 12 ? "AM" : "PM";
  const display = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${display} ${period}`;
}
