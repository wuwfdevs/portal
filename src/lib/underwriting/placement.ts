import "server-only";
import { createClient } from "@/lib/supabase/server";
import { STATION_TIME_ZONE } from "@/lib/log/timezone";

/**
 * Workflow C (docs/underwriting-design.md) — the two-way Log boundary's
 * TypeScript side. Every call here goes through one of the three security
 * definer functions log_place_underwriting_credit()/
 * log_clear_underwriting_credit()/log_list_placeable_rundown_items() added
 * by 20260807210000_underwriting_placement.sql — never a bare Supabase
 * write against log_rundown_items or a direct read of Log's own tables,
 * which this tool has no RLS access to on its own.
 */

export interface PlaceableRundownItem {
  rundown_item_id: string;
  rundown_id: string;
  air_date: string;
  scheduled_at: string;
  clock_slot_label: string | null;
  slot_duration_seconds: number;
  program_name: string;
}

export type UnderwritingRpcResult<T> = ({ ok: true } & T) | { ok: false; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "Your session has expired — sign in again.",
  forbidden: "You don't have access to Underwriting & Traffic.",
  unknown_obligation: "That obligation no longer exists.",
  unknown_item: "That rundown slot no longer exists.",
  slot_occupied: "That slot is no longer open.",
  slot_not_fillable: "That slot isn't one traffic staff fill directly.",
  slot_not_eligible: "That slot doesn't permit an underwriting credit.",
  contract_not_active: "This obligation's contract isn't active.",
  program_not_eligible: "This obligation isn't eligible for that program.",
  unknown_copy: "That copy no longer exists.",
  copy_not_linked: "That copy isn't linked to this obligation's contract — link it from the contract page first.",
  copy_duration_unknown: "Set this copy's duration before placing it.",
  too_long: "This copy is longer than the slot allows.",
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

export async function listPlaceableRundownItems(
  obligationId: string,
): Promise<UnderwritingRpcResult<{ items: PlaceableRundownItem[] }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_list_placeable_rundown_items", {
    p_obligation_id: obligationId,
  });
  if (error) return { ok: false, message: error.message };
  if (!data || "error" in data) return { ok: false, message: messageFor((data as { error?: string })?.error) };
  return { ok: true, items: data.items };
}

export interface PlaceCreditInput {
  rundownItemId: string;
  obligationId: string;
  copyId: string;
  overrideReason?: string;
}

export async function placeCredit(
  input: PlaceCreditInput,
): Promise<UnderwritingRpcResult<{ placementId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_place_underwriting_credit", {
    p_rundown_item_id: input.rundownItemId,
    p_obligation_id: input.obligationId,
    p_copy_id: input.copyId,
    p_override_reason: input.overrideReason?.trim() || null,
  });
  if (error) return { ok: false, message: error.message };
  if (!data || "error" in data) return { ok: false, message: messageFor((data as { error?: string })?.error) };
  return { ok: true, placementId: data.placement_id };
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
  if (!data || "error" in data) return { ok: false, message: messageFor((data as { error?: string })?.error) };
  return { ok: true };
}
