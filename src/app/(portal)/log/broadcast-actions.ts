"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertLogAccess } from "@/lib/log/access";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { invokeCapability } from "@/lib/capabilities/registry";
import { recordRundownItemOutcome } from "@/lib/log/capabilities";
import {
  getRundownDetail,
  hasOpenUnderwritingExceptions,
  listBroadcastEventsForItems,
  type RundownItemDetail,
} from "@/lib/log/queries";
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
 * H. Not a lock for anything except underwriting: markAired/markMissed
 * below check nothing about status, so "documented management corrections"
 * (§15.3) after submission keep working exactly as before, and every other
 * unresolved item is a review-list entry, not a block (see submission.ts).
 * Underwriting credits are the one deliberate exception — a real,
 * scoped reversal of that rule, not an oversight: a credit carries a
 * contractual "must air" obligation ordinary content doesn't, so this is
 * the one case where an unresolved problem should stop a rundown from
 * closing out rather than just being flagged for review.
 */
export async function submitRundown(formData: FormData): Promise<void> {
  const { profile } = await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  if (rundownId === "") failWith("/log", "Choose a rundown to submit.");
  const path = rundownPath(rundownId);

  const hasOpenExceptions = await hasOpenUnderwritingExceptions(rundownId);
  if (hasOpenExceptions) {
    failWith(
      path,
      "This rundown has an unresolved underwriting exception — resolve it in Underwriting & Traffic before submitting.",
    );
  }

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

/**
 * Shared write behind both wrap-up batch-attestation actions below: marks
 * every item matching `matches` that has *no* broadcast event yet as
 * aired_as_scheduled, in one insert. Never touches an item that already has
 * one (aired, or missed and now carrying whatever exception that opened) —
 * this is "confirm the silence," never a way to overwrite a known problem.
 */
async function attestUnconfirmedItems(
  rundownId: string,
  path: string,
  actorId: string,
  matches: (item: RundownItemDetail) => boolean,
): Promise<void> {
  const rundown = await getRundownDetail(rundownId);
  if (!rundown) failWith(path, "That rundown no longer exists.");

  const itemIds = rundown.breaks.flatMap((brk) => brk.items).filter(matches).map((item) => item.id);
  const events = await listBroadcastEventsForItems(itemIds);
  const confirmedIds = new Set(events.map((event) => event.rundown_item_id));
  const unconfirmedIds = itemIds.filter((id) => !confirmedIds.has(id));
  if (unconfirmedIds.length === 0) return;

  const supabase = await createClient();
  const { error } = await supabase.from("log_broadcast_events").insert(
    unconfirmedIds.map((itemId) => ({
      rundown_item_id: itemId,
      outcome: "aired_as_scheduled" as const,
      confirmation_source: "host" as const,
      recorded_by: actorId,
    })),
  );
  failIfError(error, path, "Could not mark these items as aired");
}

/**
 * The wrap-up panel's underwriting attestation — one explicit click instead
 * of confirming every untouched underwriting credit individually. Does not
 * bypass submitRundown's own open-exception check: attesting the untouched
 * ones doesn't resolve an exception an already-missed credit opened, so
 * submission can still be blocked afterward, correctly.
 */
export async function attestUnderwritingCredits(formData: FormData): Promise<void> {
  const { profile } = await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const path = rundownPath(rundownId);

  await attestUnconfirmedItems(
    rundownId,
    path,
    profile.id,
    (item) => item.item_kind === "underwriting_credit",
  );

  revalidatePath(path);
  redirect(path);
}

/**
 * The wrap-up panel's ordinary-content counterpart — but optional, not a
 * gate: nothing about submission requires this, unlike
 * attestUnderwritingCredits. It exists so a host who wants a complete
 * as-aired record (the raw material FCC Reporting will eventually read) can
 * get one in a single click instead of confirming every item individually,
 * which is exactly the per-item clutter the console dropped for ordinary
 * content in the first place.
 */
export async function attestOrdinaryContentAired(formData: FormData): Promise<void> {
  const { profile } = await assertLogAccess();
  const rundownId = field(formData, "rundown_id");
  const path = rundownPath(rundownId);

  await attestUnconfirmedItems(
    rundownId,
    path,
    profile.id,
    (item) => item.item_kind !== "underwriting_credit",
  );

  revalidatePath(path);
  redirect(path);
}
