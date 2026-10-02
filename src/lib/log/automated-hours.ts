// Automated hours: when no one is in the studio, so the credits in those
// hours go to DAD. Hosted is the norm and needs no record; only exceptions
// are kept:
//   * weekly windows (log_automated_weekly) — the routine ones, such as
//     overnights 8 PM – 5 AM. A window whose end is at or before its start
//     runs past midnight and belongs to the day it starts on;
//   * one-time changes (log_on_air_changes) in either direction — automated
//     for a holiday or a host out, live for a special inside hours that are
//     normally automated.
// A one-time change wins over the weekly windows; one-time changes never
// overlap (an exclusion constraint); weekly windows may, and their union
// counts. Pure, station time (America/Chicago). The SQL twin is
// private.log_is_automated() — keep them in step.

import { STATION_TIME_ZONE, shiftDateISO } from "./timezone";

export interface WeeklyAutomatedWindow {
  id: string;
  /** 0 = Sunday, as in log_schedule.days_of_week. */
  daysOfWeek: number[];
  /** Station-local "HH:MM:SS"; "24:00:00" allowed for the end. */
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
}

export type OnAirMode = "automated" | "live";

export interface OnAirChange {
  id: string;
  startsAt: string;
  endsAt: string;
  mode: OnAirMode;
  active: boolean;
}

export interface StationLocalParts {
  dateISO: string;
  dayOfWeek: number;
  /** Seconds since station-local midnight. */
  seconds: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: STATION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** An instant's station-local date, weekday, and time of day. */
export function stationLocalParts(instantISO: string): StationLocalParts {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date(instantISO)).map((part) => [part.type, part.value]),
  );
  const dateISO = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    dateISO,
    dayOfWeek: new Date(`${dateISO}T00:00:00Z`).getUTCDay(),
    seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second),
  };
}

function stationOffsetMs(instantMs: number): number {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(new Date(instantMs)).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instantMs;
}

/**
 * A station-local date and time as a UTC instant, right on daylight-saving
 * changeover days too: the offset is taken at the guessed instant, not at
 * the naive one (lib/log/timezone.ts's stationLocalDateTimeToUTC uses the
 * naive one, which is an hour out for times after a changeover that day —
 * fine for rundowns, which never air across one, but this module draws
 * whole days).
 */
export function stationLocalToUTC(dateISO: string, time: string): string {
  const naive = Date.parse(`${dateISO}T${time}Z`);
  const guess = naive - stationOffsetMs(naive);
  return new Date(naive - stationOffsetMs(guess)).toISOString();
}

export function timeToSeconds(time: string): number {
  const [hours = "0", minutes = "0", seconds = "0"] = time.split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function inEffect(window: WeeklyAutomatedWindow, dateISO: string): boolean {
  return (
    window.active &&
    window.effectiveFrom <= dateISO &&
    (window.effectiveTo === null || window.effectiveTo >= dateISO)
  );
}

function runsPastMidnight(window: WeeklyAutomatedWindow): boolean {
  return timeToSeconds(window.endTime) <= timeToSeconds(window.startTime);
}

/** Whether a weekly window covers a station-local moment. */
export function weeklyWindowCovers(window: WeeklyAutomatedWindow, at: StationLocalParts): boolean {
  const start = timeToSeconds(window.startTime);
  const end = timeToSeconds(window.endTime);
  if (!runsPastMidnight(window)) {
    return (
      inEffect(window, at.dateISO) &&
      window.daysOfWeek.includes(at.dayOfWeek) &&
      at.seconds >= start &&
      at.seconds < end
    );
  }
  // Past midnight: the evening part belongs to today, the early-morning part
  // to the window that started yesterday.
  if (at.seconds >= start) {
    return inEffect(window, at.dateISO) && window.daysOfWeek.includes(at.dayOfWeek);
  }
  if (at.seconds < end) {
    const yesterday = shiftDateISO(at.dateISO, -1);
    return inEffect(window, yesterday) && window.daysOfWeek.includes((at.dayOfWeek + 6) % 7);
  }
  return false;
}

/** The one-time change in effect at an instant, if any ([starts, ends)). */
export function changeAt(instantISO: string, changes: OnAirChange[]): OnAirChange | null {
  const at = Date.parse(instantISO);
  return (
    changes.find(
      (change) =>
        change.active && Date.parse(change.startsAt) <= at && at < Date.parse(change.endsAt),
    ) ?? null
  );
}

/** Whether an instant is automated: a one-time change decides, else any weekly window. */
export function isAutomated(
  instantISO: string,
  weekly: WeeklyAutomatedWindow[],
  changes: OnAirChange[],
): boolean {
  const change = changeAt(instantISO, changes);
  if (change) return change.mode === "automated";
  const at = stationLocalParts(instantISO);
  return weekly.some((window) => weeklyWindowCovers(window, at));
}

export type SegmentSource = "weekly" | "once" | "default";

export interface DaySegment {
  startsAt: string;
  endsAt: string;
  automated: boolean;
  /** What decided it: a weekly window, a one-time change, or the hosted default. */
  source: SegmentSource;
  /** The one-time change behind a `once` segment, for its reason. */
  changeId: string | null;
}

/**
 * A station-local day cut into runs of the same state, in order: each run
 * says whether it's automated and what decided it. Built by evaluating the
 * day between every boundary any window or change could put in it, so a
 * DST day and windows past midnight come out right without special cases.
 */
export function automatedSegments(
  dateISO: string,
  weekly: WeeklyAutomatedWindow[],
  changes: OnAirChange[],
): DaySegment[] {
  const dayStart = stationLocalToUTC(dateISO, "00:00:00");
  const dayEnd = stationLocalToUTC(shiftDateISO(dateISO, 1), "00:00:00");
  const startMs = Date.parse(dayStart);
  const endMs = Date.parse(dayEnd);

  const boundaries = new Set<number>([startMs, endMs]);
  for (const window of weekly) {
    for (const time of [window.startTime, window.endTime]) {
      if (time === "24:00:00") continue;
      boundaries.add(Date.parse(stationLocalToUTC(dateISO, time)));
    }
  }
  for (const change of changes) {
    if (!change.active) continue;
    boundaries.add(Date.parse(change.startsAt));
    boundaries.add(Date.parse(change.endsAt));
  }
  const points = [...boundaries].filter((ms) => ms >= startMs && ms <= endMs).sort((a, b) => a - b);

  const segments: DaySegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]!;
    const to = points[index + 1]!;
    if (to <= from) continue;
    const middle = new Date((from + to) / 2).toISOString();
    const change = changeAt(middle, changes);
    const at = stationLocalParts(middle);
    const automated = change
      ? change.mode === "automated"
      : weekly.some((window) => weeklyWindowCovers(window, at));
    const source: SegmentSource = change ? "once" : automated ? "weekly" : "default";
    const changeId = change?.id ?? null;
    const previous = segments[segments.length - 1];
    if (
      previous &&
      previous.automated === automated &&
      previous.source === source &&
      previous.changeId === changeId
    ) {
      previous.endsAt = new Date(to).toISOString();
    } else {
      segments.push({
        startsAt: new Date(from).toISOString(),
        endsAt: new Date(to).toISOString(),
        automated,
        source,
        changeId,
      });
    }
  }
  return segments;
}

/** Automated hours in a station-local day, to one decimal — the month view's per-day figure. */
export function automatedHoursOnDay(
  dateISO: string,
  weekly: WeeklyAutomatedWindow[],
  changes: OnAirChange[],
): number {
  const ms = automatedSegments(dateISO, weekly, changes)
    .filter((segment) => segment.automated)
    .reduce((sum, segment) => sum + (Date.parse(segment.endsAt) - Date.parse(segment.startsAt)), 0);
  return Math.round((ms / 3_600_000) * 10) / 10;
}
