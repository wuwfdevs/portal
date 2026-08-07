// Pure logic for Workflow G's mid-broadcast actions (docs/log-design.md) —
// specifically "moved to another valid opening." The design doc's own
// phrase is "Log evaluates program/daypart/duration/spacing/inventory
// eligibility" — daypart, spacing (minimum gap since a piece of content last
// aired), and inventory concepts have no columns anywhere in this schema
// yet (no daypart classification, no per-item air-frequency tracking), so
// this is scoped to what the schema actually models: a destination must be
// another still-open (unfilled, not-yet-past) rundown item whose slot
// permits the content's type. Duration fit is surfaced as a warning by
// lib/log/timing.ts, not a hard gate here — same "host decides" philosophy
// as lib/log/rundown-eligibility.ts.

import type { LogContentType } from "@/lib/database.types";

export interface MoveDestinationSlotLike {
  permitted_content_types: string[];
}

export interface MoveDestinationLike {
  id: string;
  content_item_id: string | null;
  scheduled_at: string;
  slot: MoveDestinationSlotLike;
}

export function isValidMoveDestination(
  destination: MoveDestinationLike,
  sourceItemId: string,
  sourceContentType: LogContentType,
  nowISO: string,
): boolean {
  if (destination.id === sourceItemId) return false;
  if (destination.content_item_id !== null) return false;
  if (new Date(destination.scheduled_at).getTime() <= new Date(nowISO).getTime()) return false;
  if (!destination.slot.permitted_content_types.includes(sourceContentType)) return false;
  return true;
}

export function listValidMoveDestinations<T extends MoveDestinationLike>(
  destinations: T[],
  sourceItemId: string,
  sourceContentType: LogContentType,
  nowISO: string,
): T[] {
  return destinations.filter((destination) =>
    isValidMoveDestination(destination, sourceItemId, sourceContentType, nowISO),
  );
}
