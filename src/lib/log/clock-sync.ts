// Which not-yet-aired rundowns no longer match the schedule — pure, tested.
//
// A rundown is pinned to the clock (and the shift times) it was generated
// from. When a program director adds a one-time change — FPREN Phase I storm
// coverage, say — rundowns generated earlier for those dates are still on the
// old clock. This finds them, so the program page can offer to switch them
// (rundown-actions.ts's switchProgramRundowns, via log_supersede_rundown).
//
// Only a rundown that is safe to replace is ever reported: still `generated`
// (never started), still in the future, built by the app from a clock rather
// than imported from the station's own DAD log, and not already superseded.
// Whether it has recorded events is the database function's call, since that
// needs a read this module doesn't have.

import { resolveEntryInForce, type ProgramScheduleEntryLike } from "@/lib/log/schedule";
import { stationLocalDateTimeToUTC } from "@/lib/log/timezone";

export interface SyncEntry extends ProgramScheduleEntryLike {
  id: string;
  clock_template_id: string;
  /** "HH:MM:SS" */
  air_time: string;
  duration_minutes: number;
}

export interface SyncRundown {
  id: string;
  air_date: string;
  status: string;
  source: string;
  shift_start_at: string;
  shift_end_at: string;
  superseded_at: string | null;
  /** The clock template the rundown's clock version belongs to; null when unknown. */
  clockTemplateId: string | null;
}

export type OutOfStepReason = "clock" | "times";

export interface OutOfStepRundown {
  rundown: SyncRundown;
  /** The entry in force on the rundown's date — what a replacement is built from. */
  entry: SyncEntry;
  reason: OutOfStepReason;
}

/** When the entry in force would start and end its shift on an air date, as UTC instants. */
export function expectedShift(
  entry: SyncEntry,
  airDate: string,
): { startAt: string; endAt: string } {
  const startAt = stationLocalDateTimeToUTC(airDate, entry.air_time);
  const endAt = new Date(Date.parse(startAt) + entry.duration_minutes * 60_000).toISOString();
  return { startAt, endAt };
}

function sameInstant(a: string, b: string): boolean {
  return Date.parse(a) === Date.parse(b);
}

/** The program's rundowns that no longer match the entry in force on their date, earliest first. */
export function findOutOfStepRundowns(
  rundowns: SyncRundown[],
  entries: SyncEntry[],
  nowISO: string,
): OutOfStepRundown[] {
  const result: OutOfStepRundown[] = [];
  for (const rundown of rundowns) {
    if (rundown.superseded_at !== null) continue;
    if (rundown.status !== "generated") continue;
    if (rundown.source !== "generated") continue;
    if (Date.parse(rundown.shift_start_at) <= Date.parse(nowISO)) continue;

    const entry = resolveEntryInForce(entries, rundown.air_date);
    if (!entry) continue;

    if (rundown.clockTemplateId !== null && rundown.clockTemplateId !== entry.clock_template_id) {
      result.push({ rundown, entry, reason: "clock" });
      continue;
    }
    const shift = expectedShift(entry, rundown.air_date);
    if (
      !sameInstant(rundown.shift_start_at, shift.startAt) ||
      !sameInstant(rundown.shift_end_at, shift.endAt)
    ) {
      result.push({ rundown, entry, reason: "times" });
    }
  }
  return result.sort((a, b) => a.rundown.air_date.localeCompare(b.rundown.air_date));
}
