import type { ScheduleEntryWithNames } from "@/lib/log/queries";
import type { OverlapOther } from "@/lib/log/schedule-overlap";

/** The slice of a schedule entry the editor's overlap check needs, small enough to pass to a client component. */
export function toOverlapOther(entry: ScheduleEntryWithNames): OverlapOther {
  return {
    id: entry.id,
    programName: entry.programName,
    entry_type: entry.entry_type,
    days_of_week: entry.days_of_week,
    start_date: entry.start_date,
    end_date: entry.end_date,
    air_time: entry.air_time,
    duration_minutes: entry.duration_minutes,
  };
}
