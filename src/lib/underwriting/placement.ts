import "server-only";
import { createClient } from "@/lib/supabase/server";
import { STATION_TIME_ZONE } from "@/lib/log/timezone";

/**
 * Workflow C (docs/underwriting-design.md) — the two-way Log boundary's
 * TypeScript side. Every call here goes through one of the security
 * definer functions this tool's migrations own
 * (log_place_underwriting_credit()/log_clear_underwriting_credit()/
 * log_list_placeable_rundown_breaks()/log_list_programs(), last rewritten
 * by 20260925150000_underwriting_demand_buckets.sql) — never a bare
 * Supabase write against log_rundown_items or a direct read of Log's own
 * tables, which this tool has no RLS access to on its own.
 */

export interface PlaceableRundownBreak {
  break_id: string;
  rundown_id: string;
  air_date: string;
  scheduled_at: string;
  /** Minutes since midnight, station-local — compared against a line's target_time. */
  minutes_of_day: number;
  label: string;
  program_name: string;
  remaining_seconds: number;
  /** The log_rundown_items id currently holding this break's highest position, if any — null for an empty break. Used to check same-underwriter/same-industry adjacency before appending another credit; see lib/underwriting/queries.ts's resolveLastItemAdjacency(). */
  last_item_id: string | null;
  /** This contract already has a credit in this break — the function refuses a second. */
  holds_this_contract: boolean;
  /** The active demand bucket this break would consume — see uw_bucket_for_date(). */
  bucket_id: string;
}

export type UnderwritingRpcResult<T> =
  ({ ok: true } & T) | { ok: false; message: string; code?: string };

const ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "Your session has expired — sign in again.",
  forbidden: "You don't have access to Underwriting & Traffic.",
  unknown_schedule_line: "That schedule line no longer exists.",
  unknown_break: "That break no longer exists.",
  break_not_eligible: "That break isn't a marked opportunity that permits an underwriting credit.",
  contract_not_active: "This schedule line's contract isn't active.",
  line_cancelled: "This schedule line is cancelled.",
  revision_not_current:
    "This schedule line belongs to a draft or superseded revision — only the current revision schedules.",
  date_not_eligible:
    "The order doesn't call for a credit on that date — no open demand covers it, or it's not an eligible day.",
  program_not_eligible: "This schedule line isn't eligible for that program.",
  pool_not_eligible: "That break isn't in this line's inventory pool (program, window, or day).",
  outside_window: "That break is outside the line's time window.",
  exact_time_mismatch: "That break doesn't start at the exact time the order states.",
  not_opening_break:
    "That break isn't the program's opening credit — an earlier marked avail in that rundown permits a credit.",
  not_closing_break:
    "That break isn't the program's closing credit — a later marked avail in that rundown permits a credit.",
  time_not_eligible: "That break doesn't satisfy the line's time rule.",
  same_contract_in_break:
    "This contract already has a credit in that break — the same underwriter never runs back to back.",
  bucket_quota_met:
    "This period is already scheduled in full for this line — the order doesn't call for another credit here.",
  day_cap_met: "This line already has as many credits on that day as the order allows.",
  unknown_makegood: "That makegood no longer exists, or belongs to another schedule line.",
  makegood_already_scheduled: "That makegood already has a slot, or is no longer scheduled.",
  makegood_needs_approval:
    "This makegood is waiting on agency approval — record the agency's answer on the exception first.",
  unknown_copy: "That copy no longer exists.",
  copy_not_linked:
    "That copy isn't linked to this contract — link it from the contract page first.",
  copy_wrong_flight: "That copy belongs to a different flight than this schedule line.",
  copy_duration_unknown: "Set this copy's duration before placing it.",
  too_long: "This copy is longer than the break's remaining time allows.",
  copy_needs_override:
    "This copy isn't approved, or is outside its effective dates — give an override reason to place it anyway.",
  override_requires_manager: "Overriding expired or unapproved copy requires a manager.",
  unknown_placement: "That placement no longer exists.",
  already_cleared: "That placement was already cleared.",
};

function messageFor(code: string | undefined): string {
  if (!code) return "Something went wrong.";
  return ERROR_MESSAGES[code] ?? `Could not complete this action (${code}).`;
}

export async function listPlaceableRundownBreaks(
  scheduleLineId: string,
): Promise<UnderwritingRpcResult<{ breaks: PlaceableRundownBreak[] }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_list_placeable_rundown_breaks", {
    p_schedule_line_id: scheduleLineId,
  });
  if (error) return { ok: false, message: error.message };
  if (!data || "error" in data)
    return { ok: false, message: messageFor((data as { error?: string })?.error) };
  return { ok: true, breaks: data.breaks };
}

export interface PlaceCreditInput {
  breakId: string;
  scheduleLineId: string;
  copyId: string;
  overrideReason?: string;
  /** Schedules this makegood with the placement — exempt from the bucket quota, checked for agency approval. */
  makegoodId?: string;
}

export async function placeCredit(input: PlaceCreditInput): Promise<
  UnderwritingRpcResult<{
    placementId: string;
    bucketId: string;
    periodStart: string;
    periodEnd: string;
  }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_place_underwriting_credit", {
    p_break_id: input.breakId,
    p_schedule_line_id: input.scheduleLineId,
    p_copy_id: input.copyId,
    p_override_reason: input.overrideReason?.trim() || null,
    p_makegood_id: input.makegoodId ?? null,
  });
  if (error) return { ok: false, message: error.message };
  if (!data || "error" in data) {
    const code = (data as { error?: string })?.error;
    return { ok: false, message: messageFor(code), code };
  }
  return {
    ok: true,
    placementId: data.placement_id,
    bucketId: data.bucket_id,
    periodStart: data.period_start,
    periodEnd: data.period_end,
  };
}

/** Station-local time for a placement's scheduled_at, for the picker and the placements list — reuses Log's own STATION_TIME_ZONE rather than a second hardcoded copy (Log already had to fix this once — see CLAUDE.md's "station timezone fix"). */
export function formatPlacementTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: STATION_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoTimestamp));
}

export async function clearCredit(placementId: string): Promise<UnderwritingRpcResult<object>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_clear_underwriting_credit", {
    p_placement_id: placementId,
  });
  if (error) return { ok: false, message: error.message };
  if (!data || "error" in data)
    return { ok: false, message: messageFor((data as { error?: string })?.error) };
  return { ok: true };
}

export interface LogProgramOption {
  id: string;
  name: string;
}

/** Human-readable program list for pickers (point 22 of the redesign) — via log_list_programs(), since this tool has no direct RLS access to log_programs. */
export async function listProgramOptions(): Promise<LogProgramOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_list_programs");
  if (error || !data || "error" in data) return [];
  return data.programs;
}
