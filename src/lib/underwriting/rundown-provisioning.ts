import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isScheduleEntryActiveOn, type ScheduleEntryLike } from "@/lib/log/schedule";
import { resolveCurrentVersion, type ClockVersionLike } from "@/lib/log/clock-versions";
import { buildRundownBreakDrafts, type RundownOpportunityLike } from "@/lib/log/rundown-generation";
import { STATION_TIME_ZONE, stationLocalDateTimeToUTC } from "@/lib/log/timezone";
import type { UwContractScheduleLineRow } from "./queries";
import type { LogScheduleEntryType } from "@/lib/database.types";

/**
 * Generates exactly as many new Log rundowns as auto-fill's own planning
 * pass is still short — never a separate, independently-sized pre-pass.
 * The previous shape provisioned a schedule line's *entire* remaining
 * campaign as one blind pass up front, sized from its own date-range walk,
 * completely independent of how many credits the fill loop would actually
 * place this run. That's two separate computations expected to just agree
 * — exactly the category of bug this feature already shipped twice the
 * same day (a per-break-vs-per-day mismatch, then an ignored target_time).
 * lib/underwriting/auto-fill.ts now plans against whatever inventory
 * already exists first, and calls provisionRundownsForDates() only for the
 * exact remaining shortfall that first pass reports — rundowns get created
 * as credits are actually scheduled against them, one computation, not two.
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
 * (20260809150000_underwriting_rundown_provisioning.sql and
 * 20260809160000_underwriting_rundown_provisioning_returns_breaks.sql).
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

/** A newly (or already) provisioned break, ready to feed straight into an AutoFillBreakCandidate — no adjacency concern since nothing else can already occupy a break this fresh. */
export interface ProvisionedBreak {
  breakId: string;
  airDate: string;
  minutesOfDay: number;
  remainingSeconds: number;
}

export interface RundownProvisioningResult {
  generatedCount: number;
  provisionedBreaks: ProvisionedBreak[];
  /** Dates tried but with no active Log schedule entry, or no clock version in effect, to generate against — a real gap for a traffic staffer to raise with Log, not something auto-fill can resolve on its own. */
  unschedulableAirDates: string[];
  errors: string[];
}

const EMPTY_PROVISIONING_RESULT: RundownProvisioningResult = {
  generatedCount: 0,
  provisionedBreaks: [],
  unschedulableAirDates: [],
  errors: [],
};

/** A break's scheduled_at (UTC instant) as minutes since midnight in the station's own timezone. */
export function minutesOfDayInStationTime(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STATION_TIME_ZONE,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

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

/**
 * Generates rundowns for candidateDates, in order, stopping as soon as
 * targetCount new ones have been generated (an unschedulable date is
 * skipped and doesn't count against the target — the next candidate date
 * is tried instead). candidateDates should already exclude any date that
 * has an active placement or an existing eligible break — the caller
 * (autoFillScheduleLine) computes that exclusion, since it's the one that
 * knows what "already covered" means for both reasons.
 */
export async function provisionRundownsForDates(
  scheduleLine: UwContractScheduleLineRow,
  candidateDates: string[],
  targetCount: number,
): Promise<RundownProvisioningResult> {
  if (scheduleLine.program_id == null || targetCount <= 0 || candidateDates.length === 0) {
    return EMPTY_PROVISIONING_RESULT;
  }

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

  let generatedCount = 0;
  const provisionedBreaks: ProvisionedBreak[] = [];
  const unschedulableAirDates: string[] = [];
  const errors: string[] = [];

  for (const airDate of candidateDates) {
    if (generatedCount >= targetCount) break;
    if (existingDates.has(airDate)) continue; // shouldn't be in candidateDates at all, but stay safe

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

    const result = genData as {
      already_existed: boolean;
      breaks: { break_id: string; permitted_content_types: string[]; scheduled_at: string; available_duration_seconds: number }[];
    };
    if (!result.already_existed) generatedCount++;

    for (const brk of result.breaks) {
      if (!brk.permitted_content_types.includes("underwriting_credit")) continue;
      provisionedBreaks.push({
        breakId: brk.break_id,
        airDate,
        minutesOfDay: minutesOfDayInStationTime(brk.scheduled_at),
        remainingSeconds: brk.available_duration_seconds,
      });
    }
  }

  return { generatedCount, provisionedBreaks, unschedulableAirDates, errors };
}
