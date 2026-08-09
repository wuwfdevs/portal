import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isScheduleEntryActiveOn, type ScheduleEntryLike } from "@/lib/log/schedule";
import { resolveCurrentVersion, type ClockVersionLike } from "@/lib/log/clock-versions";
import { buildRundownBreakDrafts, type RundownOpportunityLike } from "@/lib/log/rundown-generation";
import { stationLocalDateTimeToUTC, stationTodayISO } from "@/lib/log/timezone";
import { remainingOccurrenceDates } from "./schedule-lines";
import type { UwContractScheduleLineRow } from "./queries";
import type { LogScheduleEntryType } from "@/lib/database.types";

/**
 * Ensures a Log rundown exists for every remaining calendar day a schedule
 * line's campaign still needs (docs/underwriting-design.md §7's auto-fill
 * scheduler now provisions its own inventory, rather than only ever
 * filling into rundowns a Log producer already happened to build by hand).
 * Every date is provisioned up to the line's own end_date in one pass, not
 * just what the current run's immediate demand needs — the whole remaining
 * campaign gets its rundown scaffolding at once, so a later run's demand
 * (a makegood, newly-approved copy) always has somewhere to land without
 * its own provisioning pass.
 *
 * Nothing about "what a rundown should contain" is reimplemented here —
 * every interesting decision (which clock version is in effect, how local
 * opportunities expand across a multi-hour shift) reuses Log's own pure
 * functions directly (this is one monolith; they're dependency-free, so
 * importing them here duplicates nothing). Only the read (what schedule
 * entries/clock versions/local opportunities exist for this program, and
 * which air_dates already have a rundown) and the write (insert the
 * rundown + its breaks) cross the Log/Underwriting RLS boundary, through
 * log_get_program_schedule_context() and
 * log_generate_rundown_for_underwriting()
 * (20260809150000_underwriting_rundown_provisioning.sql).
 */

interface ScheduleEntryContext extends ScheduleEntryLike {
  id: string;
  clock_template_id: string;
  entry_type: LogScheduleEntryType;
  air_time: string;
  duration_minutes: number;
}

interface ClockVersionContext extends ClockVersionLike {
  clock_template_id: string;
}

interface LocalOpportunityContext extends RundownOpportunityLike {
  clock_version_id: string;
}

interface ProgramScheduleContext {
  schedule_entries: ScheduleEntryContext[];
  clock_versions: ClockVersionContext[];
  local_opportunities: LocalOpportunityContext[];
  existing_rundown_dates: string[];
}

export interface RundownProvisioningResult {
  generatedCount: number;
  /** Dates this schedule line needs but has no active Log schedule entry, or no clock version in effect, to generate against — a real gap for a traffic staffer to raise with Log, not something auto-fill can resolve on its own. */
  unschedulableAirDates: string[];
  errors: string[];
}

const EMPTY_PROVISIONING_RESULT: RundownProvisioningResult = {
  generatedCount: 0,
  unschedulableAirDates: [],
  errors: [],
};

/**
 * Picks the schedule entry actually in effect on a given date, when more
 * than one of a program's entries could apply — a dated override or
 * holiday entry wins over the standing recurring one; between two active
 * recurring entries (shouldn't happen in practice), the one with the later
 * start_date is the more specific, more recently added one.
 */
function pickScheduleEntry(entries: ScheduleEntryContext[], dateISO: string): ScheduleEntryContext | null {
  const active = entries.filter((entry) => isScheduleEntryActiveOn(entry, dateISO));
  if (active.length === 0) return null;
  const override = active.find((entry) => entry.entry_type !== "recurring");
  if (override) return override;
  return active.reduce((latest, entry) => (entry.start_date > latest.start_date ? entry : latest));
}

export async function ensureRundownsForScheduleLine(
  scheduleLine: UwContractScheduleLineRow,
  coveredAirDates: string[],
): Promise<RundownProvisioningResult> {
  if (scheduleLine.program_id == null) return EMPTY_PROVISIONING_RESULT; // no single program to generate a rundown for

  const dates = remainingOccurrenceDates(scheduleLine, stationTodayISO(), coveredAirDates);
  if (dates.length === 0) return EMPTY_PROVISIONING_RESULT;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_get_program_schedule_context", {
    p_program_id: scheduleLine.program_id,
  });
  if (error || !data || "error" in data) {
    return {
      ...EMPTY_PROVISIONING_RESULT,
      errors: [error?.message ?? (data as { error?: string } | null)?.error ?? "Could not read this program's schedule."],
    };
  }
  const context = data as ProgramScheduleContext;
  const existingDates = new Set(context.existing_rundown_dates);
  const missingDates = dates.filter((date) => !existingDates.has(date));
  if (missingDates.length === 0) return EMPTY_PROVISIONING_RESULT;

  let generatedCount = 0;
  const unschedulableAirDates: string[] = [];
  const errors: string[] = [];

  for (const airDate of missingDates) {
    const scheduleEntry = pickScheduleEntry(context.schedule_entries, airDate);
    if (!scheduleEntry) {
      unschedulableAirDates.push(airDate);
      continue;
    }
    const templateVersions = context.clock_versions.filter(
      (version) => version.clock_template_id === scheduleEntry.clock_template_id,
    );
    const version = resolveCurrentVersion(templateVersions, airDate);
    if (!version) {
      unschedulableAirDates.push(airDate);
      continue;
    }
    const opportunities = context.local_opportunities.filter((o) => o.clock_version_id === version.id);

    const shiftStartAt = stationLocalDateTimeToUTC(airDate, scheduleEntry.air_time);
    const shiftEndAt = new Date(new Date(shiftStartAt).getTime() + scheduleEntry.duration_minutes * 60_000).toISOString();
    const drafts = buildRundownBreakDrafts(opportunities, shiftStartAt, scheduleEntry.duration_minutes);

    const { data: genData, error: genError } = await supabase.rpc("log_generate_rundown_for_underwriting", {
      p_program_id: scheduleLine.program_id,
      p_schedule_entry_id: scheduleEntry.id,
      p_clock_version_id: version.id,
      p_air_date: airDate,
      p_shift_start_at: shiftStartAt,
      p_shift_end_at: shiftEndAt,
      p_break_drafts: drafts as unknown as Record<string, unknown>[],
    });
    if (genError || !genData || "error" in genData) {
      errors.push(
        genError?.message ??
          (genData as { error?: string } | null)?.error ??
          `Could not generate a rundown for ${airDate}.`,
      );
      continue;
    }
    if (!(genData as { already_existed: boolean }).already_existed) generatedCount++;
  }

  return { generatedCount, unschedulableAirDates, errors };
}
