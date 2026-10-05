// Hours closed to underwriting: when Traffic's automation (auto-fill,
// rundown provisioning, bumping) may not schedule a credit. Every hour is
// open unless listed; only the exceptions are kept, the same shape as
// automated hours (automated-hours.ts), whose window and segment logic
// this reuses:
//   * weekly closed windows (log_underwriting_closed_weekly) — the routine
//     ones, such as 5 AM – 5 PM every day. A window whose end is at or
//     before its start runs past midnight and belongs to the day it starts
//     on;
//   * one-time changes (log_underwriting_hour_changes) in either direction
//     — closed for a pledge week, open for a special inside hours that are
//     normally closed.
// A one-time change wins over the weekly windows; changes never overlap
// (an exclusion constraint); weekly windows may, and their union counts.
// A staffer's manual placement and a host's relocation are not automation
// and are never refused by this — see docs/underwriting-traffic-redesign.md
// §18. Pure, station time. The SQL twin is
// private.log_is_closed_to_underwriting() — keep them in step.

import {
  changeAt,
  coverageSegments,
  coveredHoursOnDay,
  stationLocalParts,
  weeklyWindowCovers,
  type CoverageSegment,
  type WeeklyAutomatedWindow,
} from "./automated-hours";

/** A weekly closed window — the same columns as a weekly automated window. */
export type ClosedWeeklyWindow = WeeklyAutomatedWindow;

export type UnderwritingHoursMode = "closed" | "open";

export interface UnderwritingHourChange {
  id: string;
  startsAt: string;
  endsAt: string;
  mode: UnderwritingHoursMode;
  active: boolean;
}

/** Whether an instant is closed to underwriting: a one-time change decides, else any weekly closed window. */
export function isClosedToUnderwriting(
  instantISO: string,
  weekly: ClosedWeeklyWindow[],
  changes: UnderwritingHourChange[],
): boolean {
  const change = changeAt(instantISO, changes);
  if (change) return change.mode === "closed";
  const at = stationLocalParts(instantISO);
  return weekly.some((window) => weeklyWindowCovers(window, at));
}

export interface ClosedSegment extends CoverageSegment {
  closed: boolean;
}

/** A station-local day cut into closed and open runs, each saying what decided it. */
export function closedSegments(
  dateISO: string,
  weekly: ClosedWeeklyWindow[],
  changes: UnderwritingHourChange[],
): ClosedSegment[] {
  return coverageSegments(dateISO, weekly, changes, (change) => change.mode === "closed").map(
    (segment) => ({ ...segment, closed: segment.covered }),
  );
}

/** Hours closed to underwriting in a station-local day, to one decimal. */
export function closedHoursOnDay(
  dateISO: string,
  weekly: ClosedWeeklyWindow[],
  changes: UnderwritingHourChange[],
): number {
  return coveredHoursOnDay(closedSegments(dateISO, weekly, changes));
}
