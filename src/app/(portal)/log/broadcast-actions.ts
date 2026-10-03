"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { assertLogAccess } from "@/lib/log/access";
import { ForbiddenError } from "@/lib/auth/authz";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { invokeCapability } from "@/lib/capabilities/registry";
import { recordRundownItemOutcome } from "@/lib/log/capabilities";
import {
  getRundownDetail,
  hasOpenUnderwritingExceptions,
  listBroadcastEventsForItems,
  type RundownItemDetail,
} from "@/lib/log/queries";
import { relocateCredit, relocateItem } from "@/lib/log/rundown-relocation";
import type { BroadcastSyncResponse, QueuedBroadcastAction } from "@/lib/log/broadcast-queue";
import type { LogMissReason } from "@/lib/database.types";

// Workflow G's mid-broadcast actions (docs/log-design.md). Aired, missed,
// and relocating an item all go through syncBroadcastAction below, the
// write path of the live screen's offline queue (2026-09-28) — the old
// redirecting markAired/markMissed form actions are gone, since a <form>
// submit that can't reach the server throws the whole screen into the error
// boundary. A relocation is a plain rundown edit, not a broadcast outcome;
// see lib/log/rundown-relocation.ts and lib/log/mid-broadcast.ts's file
// header.

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function rundownPath(rundownId: string): string {
  return `/log/rundowns/${rundownId}`;
}

/**
 * Freezes a reference version of the rundown — docs/log-design.md Workflow
 * H. Not a lock for anything except underwriting: recording aired/missed
 * (syncBroadcastAction) checks nothing about status, so "documented management corrections"
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
      "This rundown has an unresolved underwriting exception — resolve it in Traffic before submitting.",
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

const MISS_REASONS: [LogMissReason, ...LogMissReason[]] = [
  "network_timing",
  "breaking_news",
  "segment_overrun",
  "technical_problem",
  "host_error",
  "unavailable_copy",
  "other",
];

// The queue's payload arrives from the browser (and, after a reload, from
// IndexedDB), so it is parsed like any other untrusted input.
const queuedBase = {
  id: z.string().uuid(),
  rundownId: z.string().uuid(),
  itemId: z.string().uuid(),
  occurredAt: z.string(),
};
const queuedActionSchema = z.discriminatedUnion("kind", [
  z.object({ ...queuedBase, kind: z.literal("outcome_aired") }),
  z.object({
    ...queuedBase,
    kind: z.literal("outcome_missed"),
    reason: z.enum(MISS_REASONS),
    notes: z.string().trim().max(2000).nullable(),
  }),
  z.object({
    ...queuedBase,
    kind: z.literal("relocate_item"),
    destinationBreakId: z.string().uuid(),
    orderedItemIds: z.array(z.string().uuid()).min(1).max(200),
  }),
  z.object({
    ...queuedBase,
    kind: z.literal("relocate_credit"),
    destinationBreakId: z.string().uuid(),
  }),
]);

/**
 * The one write path for the live rundown screen's offline queue
 * (lib/log/broadcast-queue.ts): aired, missed, and the two relocations.
 * Called from the queue's drain loop, never from a <form>, and never
 * redirects — the queue needs a plain answer: done, refused (drop it and
 * tell the host), or no session (keep it and ask them to sign in). A
 * network failure never gets here; the queue sees the rejected promise and
 * retries.
 *
 * No revalidatePath: the screen refreshes once when the queue empties,
 * rather than re-rendering after every queued action.
 */
export async function syncBroadcastAction(
  rawAction: QueuedBroadcastAction,
): Promise<BroadcastSyncResponse> {
  const parsed = queuedActionSchema.safeParse(rawAction);
  if (!parsed.success)
    return { status: "rejected", message: "That action wasn't in a form the server understands." };
  const action = parsed.data;

  try {
    await assertLogAccess();
  } catch (error) {
    // Anything but a refusal (a database timeout, say) is rethrown, so the
    // queue sees a failed send and retries it like a network drop.
    if (!(error instanceof ForbiddenError)) throw error;
    return {
      status: "unauthenticated",
      message:
        "Your sign-in has expired (or your On Air access changed). Sign in again to send what's waiting.",
    };
  }

  switch (action.kind) {
    case "outcome_aired":
    case "outcome_missed": {
      // The host's tap on the card is the confirmation, same convention as
      // sendAnswerToSourcework's.
      const result = await invokeCapability(
        recordRundownItemOutcome,
        action.kind === "outcome_aired"
          ? {
              outcome: "aired",
              itemId: action.itemId,
              eventId: action.id,
              occurredAt: action.occurredAt,
            }
          : {
              outcome: "missed",
              itemId: action.itemId,
              reason: action.reason,
              notes: action.notes ?? undefined,
              eventId: action.id,
              occurredAt: action.occurredAt,
            },
        { confirmed: true },
      );
      return result.ok ? { status: "ok" } : { status: "rejected", message: result.message };
    }
    case "relocate_item": {
      const result = await relocateItem(
        action.itemId,
        action.destinationBreakId,
        action.orderedItemIds,
      );
      return result.error ? { status: "rejected", message: result.error } : { status: "ok" };
    }
    case "relocate_credit": {
      const result = await relocateCredit(action.itemId, action.destinationBreakId);
      // same_break on a replay means the first send already moved it.
      if (result.error && result.code !== "same_break")
        return { status: "rejected", message: result.error };
      return { status: "ok" };
    }
  }
}

/**
 * A reachability probe for the live screen: answers without touching the
 * database or the session. Unauthenticated on purpose — it reveals nothing
 * and writes nothing. See log-poller.tsx for why a probe has to come before
 * router.refresh().
 */
export async function pingLog(): Promise<true> {
  return true;
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
