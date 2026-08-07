// Pure logic for Workflow G's mid-broadcast actions (docs/log-design.md) —
// specifically "moved to another valid opening." The design doc's own
// phrase is "Log evaluates program/daypart/duration/spacing/inventory
// eligibility" — daypart, spacing (minimum gap since a piece of content last
// aired), and inventory concepts have no columns anywhere in this schema
// yet (no daypart classification, no per-item air-frequency tracking), so
// this is scoped to what the schema actually models: a destination must be
// another still-open break (a break with capacity for one more item) whose
// permitted content types include the moving item's type. Duration fit is
// surfaced as a warning by lib/log/timing.ts, not a hard gate here — same
// "host decides" philosophy as lib/log/rundown-eligibility.ts.
//
// A destination is now a *break*, not a single-slot rundown item — a break
// can hold several items when allow_multiple is set, so "open" means "has
// room for one more," not "is completely empty."

import type { LogContentType } from "@/lib/database.types";

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
  sourceContentType: LogContentType,
  nowISO: string,
): boolean {
  if (destination.id === sourceBreakId) return false;
  if (!destination.allow_multiple && destination.item_count > 0) return false;
  if (new Date(destination.scheduled_at).getTime() <= new Date(nowISO).getTime()) return false;
  if (!destination.permitted_content_types.includes(sourceContentType)) return false;
  return true;
}

export function listValidMoveDestinations<T extends MoveDestinationBreakLike>(
  destinations: T[],
  sourceBreakId: string,
  sourceContentType: LogContentType,
  nowISO: string,
): T[] {
  return destinations.filter((destination) =>
    isValidMoveDestination(destination, sourceBreakId, sourceContentType, nowISO),
  );
}
