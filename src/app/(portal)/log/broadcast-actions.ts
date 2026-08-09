"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertLogAccess } from "@/lib/log/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { invokeCapability } from "@/lib/capabilities/registry";
import { recordRundownItemOutcome } from "@/lib/log/capabilities";
import type { LogMissReason } from "@/lib/database.types";

// Workflow G's mid-broadcast actions (docs/log-design.md): markAired and
// markMissed. There used to be a third, moveRundownItem — it's gone
// (2026-08-09). Relocating an item is now a plain rundown edit (drag-and-
// drop, or its "Move to…" select fallback), not a broadcast outcome; see
// rundown-actions.ts's relocateRundownItem and lib/log/mid-broadcast.ts's
// file header for why.

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function rundownPath(rundownId: string): string {
  return `/log/rundowns/${rundownId}`;
}

/**
 * Freezes a reference version of the rundown — docs/log-design.md Workflow
 * H. Not a lock: markAired/markMissed below check nothing about status, so
 * "documented management corrections" (§15.3) after submission keep working
 * exactly as before. Fine to call again (e.g. after a late correction) — it
 * just re-stamps submitted_at/submitted_by.
 */
export async function submitRundown(formData: FormData): Promise<void> {
  const { profile } = await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  if (rundownId === "") failWith("/log", "Choose a rundown to submit.");
  const path = rundownPath(rundownId);

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
export async function startBroadcast(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  if (rundownId === "") failWith("/log", "Choose a rundown to start.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("log_rundowns")
    .update({ status: "in_progress" })
    .eq("id", rundownId)
    .eq("status", "generated");
  failIfError(error, "/log", "Could not start the broadcast");

  revalidatePath("/log");
  redirect(rundownPath(rundownId));
}

/** Thin adapter over log.rundownItem.recordOutcome — the console button click is itself the confirmation, same convention as sendAnswerToSourcework's. */
export async function markAired(formData: FormData): Promise<void> {
  await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const itemId = field(formData, "item_id");
  const path = rundownPath(rundownId);

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
  const path = rundownPath(rundownId);
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
