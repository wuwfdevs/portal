// Pure logic for relocating a rundown item — dragging it to a different spot
// within a break, or into a different break entirely. This used to be a
// mid-broadcast-only "Move" outcome, recorded in log_broadcast_events
// alongside aired/missed; it no longer is (see rundown-actions.ts's
// relocateRundownItem) — moving ordinary content around the rundown is now
// just an edit, the same as dragging a block in any block editor, not a
// broadcast event worth a historical record. Underwriting credits are
// excluded entirely: they're relocated through Underwriting & Traffic's own
// placement/makegood mechanism, never this one.
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
  allow_multiple: boolean;
  item_count: number;
}

export function isValidMoveDestination(
  destination: MoveDestinationBreakLike,
  sourceBreakId: string,
  sourceKind: RelocatableItemKind,
  sourceContentType: LogContentType | null,
  nowISO: string | null,
): boolean {
  if (destination.id === sourceBreakId) return false;
  if (!destination.allow_multiple && destination.item_count > 0) return false;
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
