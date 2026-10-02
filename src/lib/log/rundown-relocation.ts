import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getContentItemDetail, getRundownBreak, getRundownItem } from "./queries";
import { isValidMoveDestination, type RelocatableItemKind } from "./mid-broadcast";
import type { LogContentType } from "@/lib/database.types";

// Relocating a rundown item — the write behind the breaks board's drag-and-
// drop and its keyboard/touch-accessible "Move to…" menu item. Reached only
// through broadcast-actions.ts's syncBroadcastAction (2026-09-28): a move
// is one of the live screen's offline-queued actions, so the board enqueues
// it and the queue sends it, rather than the board calling an action
// directly. Callers have already asserted Log access.
//
// "Moved" is a plain rundown edit, not a broadcast outcome — see
// lib/log/mid-broadcast.ts's file header. Nothing is written to
// log_broadcast_events, and nothing is left behind at the old spot.

/**
 * Handles both a same-break reorder and a cross-break move with one write:
 * orderedItemIds is the destination break's complete item order after the
 * drop (including the moved item), renumbered 1..N. The source break's
 * other items are left exactly where they are — position doesn't need to
 * stay contiguous, only correctly ordered. Replaying it is harmless: it
 * states where the items end up, not a step from where they are.
 *
 * Underwriting credits are excluded — see relocateCredit below. They need a
 * security-definer boundary (they write into uw_scheduled_placements, which
 * Log has no ordinary RLS access to at all), not a bare update like this.
 */
export async function relocateItem(
  itemId: string,
  destinationBreakId: string,
  orderedItemIds: string[],
): Promise<{ error?: string }> {
  const item = await getRundownItem(itemId);
  if (!item) return { error: "That item no longer exists." };
  if (item.item_kind === "underwriting_credit") {
    return { error: "Underwriting credits move through relocateCredit, not this function." };
  }

  const destinationBreak = await getRundownBreak(destinationBreakId);
  if (!destinationBreak) return { error: "That break no longer exists." };

  if (item.break_id !== destinationBreakId) {
    let kind: RelocatableItemKind = "live_read";
    let contentType: string | null = null;
    if (item.item_kind === "content" && item.content_item_id) {
      kind = "content";
      const contentItem = await getContentItemDetail(item.content_item_id);
      contentType = contentItem?.content_type ?? null;
    } else if (item.item_kind === "weather") {
      kind = "weather";
    }

    // nowISO is null here (not the "already in the past" gate) — that check
    // is a client-side UX hint only, same reasoning duration-fit warnings
    // use elsewhere in Log: the schema and this write don't need to enforce
    // it to stay correct. Content-type eligibility does — there's no
    // capacity cap to check anymore (see CLAUDE.md's dated note).
    const eligible = isValidMoveDestination(
      {
        id: destinationBreak.id,
        scheduled_at: destinationBreak.scheduled_at,
        permitted_content_types: destinationBreak.permitted_content_types,
      },
      item.break_id,
      kind,
      contentType as LogContentType | null,
      null,
    );
    if (!eligible) return { error: "That break can't hold this item." };
  }

  const supabase = await createClient();
  const results = await Promise.all(
    orderedItemIds.map((id, index) =>
      supabase
        .from("log_rundown_items")
        .update({ break_id: destinationBreakId, position: index + 1 })
        .eq("id", id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) return { error: "Could not move this item." };

  return {};
}

const RELOCATE_CREDIT_ERRORS: Record<string, string> = {
  unauthenticated: "Your session has expired — sign in again.",
  forbidden: "You don't have access to Log.",
  not_a_credit: "That item isn't an underwriting credit.",
  already_aired: "This credit already aired — it can't be moved.",
  unknown_placement: "Couldn't find this credit's scheduled placement.",
  unknown_break: "That break no longer exists.",
  same_break: "That's already where this credit is.",
  different_rundown: "A credit can only move within the same rundown.",
  break_not_eligible: "That break doesn't permit an underwriting credit.",
  break_occupied: "That break is already occupied and doesn't allow more than one item.",
  too_long: "This credit is longer than that break's remaining time allows.",
};

/**
 * Relocates an already-placed underwriting credit to a different open break
 * in the *same* rundown, through log_relocate_underwriting_credit() — a
 * security-definer function gated by has_log_access (not
 * has_underwriting_access — see that migration's header for why the
 * narrower operation gets the lighter gate).
 *
 * Works whether the credit hasn't aired yet or was already marked missed —
 * a host recovering from a miss mid-broadcast uses this exact same path,
 * not a separate "schedule a makegood" step. It only fails once the credit
 * has actually aired. Returns the function's error code too, so the queue
 * can treat `same_break` on a replay (the first send landed; its response
 * was lost) as success.
 */
export async function relocateCredit(
  itemId: string,
  destinationBreakId: string,
): Promise<{ error?: string; code?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_relocate_underwriting_credit", {
    p_item_id: itemId,
    p_destination_break_id: destinationBreakId,
  });
  if (error) {
    // The placement guard (uw_guard_placement_dad_cut()) raises rather than
    // returning a code: DAD plays that break, and this message has no cut.
    if (error.message === "copy_needs_dad_cut")
      return {
        error: "That break plays from DAD, and this credit has no DAD cut.",
        code: "copy_needs_dad_cut",
      };
    return { error: "Could not move this credit." };
  }
  if (!data || "error" in data) {
    const code = (data as { error?: string } | null)?.error;
    return { error: (code && RELOCATE_CREDIT_ERRORS[code]) || "Could not move this credit.", code };
  }

  return {};
}
