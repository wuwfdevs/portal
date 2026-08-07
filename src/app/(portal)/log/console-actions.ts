"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertLogAccess } from "@/lib/log/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { invokeCapability } from "@/lib/capabilities/registry";
import { recordRundownItemOutcome } from "@/lib/log/capabilities";
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

/**
 * Freezes a reference version of the rundown — docs/log-design.md Workflow
 * H. Not a lock: markAired/markMissed/moveRundownItem above check nothing
 * about status, so "documented management corrections" (§15.3) after
 * submission keep working exactly as before. Fine to call again (e.g. after
 * a late correction) — it just re-stamps submitted_at/submitted_by.
 */
export async function submitRundown(formData: FormData): Promise<void> {
  const { profile } = await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  if (rundownId === "") failWith("/log", "Choose a rundown to submit.");
  const path = consolePath(rundownId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("log_rundowns")
    .update({ status: "submitted", submitted_at: new Date().toISOString(), submitted_by: profile.id })
    .eq("id", rundownId)
    .in("status", ["generated", "in_progress", "submitted"]);
  failIfError(error, path, "Could not submit this rundown");

  revalidatePath("/log");
  revalidatePath(path);
  redirect(path);
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

/** Thin adapter over log.rundownItem.recordOutcome — the console button click is itself the confirmation, same convention as sendAnswerToSourcework's. */
export async function markAired(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const itemId = field(formData, "item_id");
  const path = consolePath(rundownId);

  const result = await invokeCapability(
    recordRundownItemOutcome,
    { outcome: "aired", itemId },
    { confirmed: true },
  );
  if (!result.ok) failWith(path, result.message);

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

/** Thin adapter over log.rundownItem.recordOutcome. */
export async function markMissed(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const itemId = field(formData, "item_id");
  const path = consolePath(rundownId);
  const reason = field(formData, "reason") as LogMissReason;
  if (!MISS_REASONS.includes(reason)) failWith(path, "Choose a reason.");

  const result = await invokeCapability(
    recordRundownItemOutcome,
    { outcome: "missed", itemId, reason, notes: field(formData, "notes") || undefined },
    { confirmed: true },
  );
  if (!result.ok) failWith(path, result.message);

  revalidatePath(path);
  redirect(path);
}

/**
 * Thin adapter over log.rundownItem.recordOutcome's "moved" branch: the
 * destination gets the source's content, the source goes back to empty, and
 * the source's own broadcast event records 'skipped'. Running this again
 * with source/destination swapped is exactly how the console's "Undo" link
 * works — there is nothing else to reverse, since log_broadcast_events is
 * append-only.
 */
export async function moveRundownItem(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const sourceItemId = field(formData, "source_item_id");
  const destinationItemId = field(formData, "destination_item_id");
  const path = consolePath(rundownId);
  if (sourceItemId === "" || destinationItemId === "") failWith(path, "Choose a destination.");

  const result = await invokeCapability(
    recordRundownItemOutcome,
    { outcome: "moved", sourceItemId, destinationItemId },
    { confirmed: true },
  );
  if (!result.ok) failWith(path, result.message);

  revalidatePath(path);
  redirect(`${path}?moved_from=${sourceItemId}&moved_to=${destinationItemId}`);
}
