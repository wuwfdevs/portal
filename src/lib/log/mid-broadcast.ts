// Pure logic for relocating a rundown item — dragging it to a different spot
// within a break, or into a different break entirely. This used to be a
// mid-broadcast-only "Move" outcome, recorded in log_broadcast_events
// alongside aired/missed; it no longer is (see rundown-actions.ts's
// relocateRundownItem) — moving ordinary content around the rundown is now
// just an edit, the same as dragging a block in any block editor, not a
// broadcast event worth a historical record.
//
// Underwriting credits are a separate, narrower case (see
// isValidCreditRelocationDestination/sortByProximityToOriginal below and
// rundown-actions.ts's relocateUnderwritingCredit): a host can move an
// already-placed credit — before its break's time passes, or after,
// recovering from a "missed" mark — but only within the same rundown, and
// the write goes through a security-definer boundary function rather than
// this file's RelocatableItemKind path, since this tool has no ordinary RLS
// access to uw_scheduled_placements. "Moved because a host had to make it
// fit" is a real, expected occurrence at a small station, not an edge case
// to design against — see docs/log-design.md and CLAUDE.md's 2026-08-09 note.
//
// nowISO is nullable because eligibility only cares about "already aired"
// once a rundown is actually live — pre-air, every break is still ahead of
// it, so there's nothing to exclude on that basis.

import type { LogContentType } from "@/lib/database.types";

export type RelocatableItemKind = "content" | "weather" | "live_read";

export interface MoveDestinationBreakLike {
  id: string;
  scheduled_at: string;
  permitted_content_types: string[];
}

export function isValidMoveDestination(
  destination: MoveDestinationBreakLike,
  sourceBreakId: string,
  sourceKind: RelocatableItemKind,
  sourceContentType: LogContentType | null,
  nowISO: string | null,
): boolean {
  if (destination.id === sourceBreakId) return false;
  if (nowISO !== null && new Date(destination.scheduled_at).getTime() <= new Date(nowISO).getTime())
    return false;

  if (sourceKind === "content") {
    return sourceContentType !== null && destination.permitted_content_types.includes(sourceContentType);
  }
  if (sourceKind === "weather") {
    return destination.permitted_content_types.includes("weather");
  }
  // live_read: never gated by permitted_content_types — createLiveReadItem
  // doesn't check it either, since a live read is host-authored, not drawn
  // from the network-structured content library.
  return true;
}

export function listValidMoveDestinations<T extends MoveDestinationBreakLike>(
  destinations: T[],
  sourceBreakId: string,
  sourceKind: RelocatableItemKind,
  sourceContentType: LogContentType | null,
  nowISO: string | null,
): T[] {
  return destinations.filter((destination) =>
    isValidMoveDestination(destination, sourceBreakId, sourceKind, sourceContentType, nowISO),
  );
}

// --- Underwriting credit relocation -----------------------------------------
//
// Deliberately not folded into isValidMoveDestination above: a credit's
// eligibility has nothing to do with permitted_content_types matching a
// content type (the server checks 'underwriting_credit' is on the list, but
// that's the only content-shaped check) and everything to do with staying
// inside the same rundown — the write behind this can't cross rundowns at
// all, unlike an ordinary content move.
//
// Deliberately no "already in the past, when live" gate either, unlike
// isValidMoveDestination above — that gate is a real, intended restriction
// for ordinary content (a planning move), but for a credit it would defeat
// the whole feature: this function exists specifically so a host can recover
// from a missed credit or otherwise fix an exception mid-broadcast, and by
// the time that's needed, the nearby breaks worth moving into are routinely
// already behind "now" — including every "earlier" break, almost by
// definition, once the rundown is live. log_relocate_underwriting_credit()
// itself (the security-definer function this feeds) never enforced a time
// check at all, so this was a client-only restriction blocking a real,
// expected host action without protecting anything the write path needed.

export interface CreditRelocationBreakLike {
  id: string;
  rundown_id: string;
  scheduled_at: string;
  permitted_content_types: string[];
}

export function isValidCreditRelocationDestination(
  destination: CreditRelocationBreakLike,
  sourceBreakId: string,
  sourceRundownId: string,
): boolean {
  if (destination.id === sourceBreakId) return false;
  if (destination.rundown_id !== sourceRundownId) return false;
  if (!destination.permitted_content_types.includes("underwriting_credit")) return false;
  return true;
}

/**
 * Sorts candidate breaks by closeness to the credit's original scheduled
 * time, nearest first — "move it to the closest break to when it was
 * supposed to air" rather than just the next chronological one. Stable for
 * equal distances (keeps the input's relative order), so a caller that
 * already sorted by time doesn't see equal-distance breaks reshuffle.
 */
export function sortByProximityToOriginal<T>(
  breaks: T[],
  originalScheduledAtISO: string,
  getScheduledAt: (brk: T) => string = (brk) => (brk as { scheduled_at: string }).scheduled_at,
): T[] {
  const originalMs = new Date(originalScheduledAtISO).getTime();
  return breaks
    .map((brk, index) => ({ brk, index, distance: Math.abs(new Date(getScheduledAt(brk)).getTime() - originalMs) }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .map(({ brk }) => brk);
}
