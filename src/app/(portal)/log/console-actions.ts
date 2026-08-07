"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertLogAccess } from "@/lib/log/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { getRundownItem } from "@/lib/log/queries";
import type { LogMissReason } from "@/lib/database.types";

// Workflow G's three mid-broadcast actions (docs/log-design.md). "Moved" is
// modeled as filling a different, still-open rundown item with the same
// content and clearing the original one — see
// supabase/migrations/20260807160000_log_broadcast_events.sql's file header
// for why, and for the append-only reasoning that makes "undo" just the
// same move run in reverse rather than a delete/edit of history.

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function consolePath(rundownId: string): string {
  return `/log/rundowns/${rundownId}/console`;
}

/** Marks a rundown as under way — 'generated' -> 'in_progress'. Idempotent: fine to call again once already in progress. */
export async function startConsole(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  if (rundownId === "") failWith("/log", "Choose a rundown to start.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("log_rundowns")
    .update({ status: "in_progress" })
    .eq("id", rundownId)
    .eq("status", "generated");
  failIfError(error, "/log", "Could not start the console");

  revalidatePath("/log");
  redirect(consolePath(rundownId));
}

/** Records an item as aired, on its own scheduled placement. */
export async function markAired(formData: FormData): Promise<void> {
  const { profile } = await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const itemId = field(formData, "item_id");
  const path = consolePath(rundownId);

  const supabase = await createClient();
  const { error } = await supabase.from("log_broadcast_events").insert({
    rundown_item_id: itemId,
    outcome: "aired_as_scheduled",
    confirmation_source: "host",
    recorded_by: profile.id,
  });
  failIfError(error, path, "Could not record this item as aired");

  revalidatePath(path);
  redirect(path);
}

const MISS_REASONS: LogMissReason[] = [
  "network_timing",
  "breaking_news",
  "segment_overrun",
  "technical_problem",
  "host_error",
  "unavailable_copy",
  "other",
];

/** Records an item as missed, with a brief reason — never a lengthy narrative, per docs/log-design.md Workflow G. */
export async function markMissed(formData: FormData): Promise<void> {
  const { profile } = await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const itemId = field(formData, "item_id");
  const path = consolePath(rundownId);
  const reason = field(formData, "reason") as LogMissReason;
  if (!MISS_REASONS.includes(reason)) failWith(path, "Choose a reason.");

  const supabase = await createClient();
  const { error } = await supabase.from("log_broadcast_events").insert({
    rundown_item_id: itemId,
    outcome: "missed",
    reason,
    notes: field(formData, "notes") || null,
    confirmation_source: "host",
    recorded_by: profile.id,
  });
  failIfError(error, path, "Could not record this item as missed");

  revalidatePath(path);
  redirect(path);
}

/**
 * Moves a filled item's content to a different, still-open slot: the
 * destination gets the content, the source goes back to empty, and the
 * source's own broadcast event records 'skipped' (see the migration file
 * header). Running this again with source/destination swapped is exactly
 * how the console's "Undo" link works — there is nothing else to reverse,
 * since log_broadcast_events is append-only.
 */
export async function moveRundownItem(formData: FormData): Promise<void> {
  const { profile } = await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const sourceItemId = field(formData, "source_item_id");
  const destinationItemId = field(formData, "destination_item_id");
  const path = consolePath(rundownId);
  if (sourceItemId === "" || destinationItemId === "") failWith(path, "Choose a destination.");

  const source = await getRundownItem(sourceItemId);
  if (!source || source.content_item_id === null) failWith(path, "There is nothing to move.");
  const destination = await getRundownItem(destinationItemId);
  if (!destination || destination.content_item_id !== null) {
    failWith(path, "That destination is no longer open.");
  }

  const supabase = await createClient();
  const { data: sourceSlot, error: slotError } = await supabase
    .from("log_clock_slots")
    .select("duration_seconds")
    .eq("id", source.clock_slot_id)
    .single();
  failIfError(slotError, path, "Could not move this item");
  const { error: destinationError } = await supabase
    .from("log_rundown_items")
    .update({
      content_item_id: source.content_item_id,
      planned_duration_seconds: source.planned_duration_seconds,
      placement_status: "replaceable",
    })
    .eq("id", destinationItemId);
  failIfError(destinationError, path, "Could not move this item");

  const { error: sourceError } = await supabase
    .from("log_rundown_items")
    .update({
      content_item_id: null,
      planned_duration_seconds: sourceSlot?.duration_seconds ?? source.planned_duration_seconds,
      placement_status: "editable",
    })
    .eq("id", sourceItemId);
  failIfError(sourceError, path, "Moved, but could not clear the original slot");

  const { error: eventError } = await supabase.from("log_broadcast_events").insert({
    rundown_item_id: sourceItemId,
    outcome: "skipped",
    notes: `Moved to a later opening (${destinationItemId}).`,
    confirmation_source: "host",
    recorded_by: profile.id,
  });
  failIfError(eventError, path, "Moved, but could not record it");

  revalidatePath(path);
  redirect(`${path}?moved_from=${sourceItemId}&moved_to=${destinationItemId}`);
}
