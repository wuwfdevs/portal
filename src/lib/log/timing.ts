// The timing engine, per docs/log-design.md §12/"Timing is a pure, tested
// module — not stored state": fit calculations derived from rundown items +
// clock slots, never persisted as a computed column. Scoped to this slice's
// build-time concern (does an item fit its slot, is the rundown ready) —
// the live console's continuous on-time/running-long/running-short state
// (§12.4) needs actual wall-clock playback progress and belongs to the next
// slice (the host console), not rundown generation.

import type { LogRequirementLevel } from "@/lib/database.types";

export interface SlotFit {
  slotDurationSeconds: number;
  plannedDurationSeconds: number;
  /** Slot time left over after the planned material — negative when over. */
  remainingSeconds: number;
  /** How far over the slot's duration the planned material runs, 0 if it fits. */
  overSeconds: number;
  fits: boolean;
}

export function computeSlotFit(slotDurationSeconds: number, plannedDurationSeconds: number | null): SlotFit {
  const planned = plannedDurationSeconds ?? 0;
  const remainingSeconds = slotDurationSeconds - planned;
  return {
    slotDurationSeconds,
    plannedDurationSeconds: planned,
    remainingSeconds,
    overSeconds: Math.max(0, -remainingSeconds),
    fits: remainingSeconds >= 0,
  };
}

export interface RundownSummaryItemLike {
  content_item_id: string | null;
  /** Set instead of content_item_id for an underwriting-credit placement — docs/underwriting-design.md §6. Either one counts as filled. */
  underwriting_copy_id?: string | null;
  requirement_level: LogRequirementLevel;
  planned_duration_seconds: number;
  slot_duration_seconds: number;
}

export interface RundownSummary {
  totalItems: number;
  filledItems: number;
  /** Slots that must be filled with something before air and currently aren't. */
  emptyRequiredItems: number;
  overCount: number;
  totalOverSeconds: number;
  /** No unfilled required slots and nothing running over its slot. */
  ready: boolean;
}

/** A rundown-level readiness summary for the builder screen's header — recomputed on every render, not stored. */
export function computeRundownSummary(items: RundownSummaryItemLike[]): RundownSummary {
  let filledItems = 0;
  let emptyRequiredItems = 0;
  let overCount = 0;
  let totalOverSeconds = 0;

  for (const item of items) {
    const filled = item.content_item_id !== null || Boolean(item.underwriting_copy_id);
    if (filled) filledItems++;
    else if (item.requirement_level === "required") emptyRequiredItems++;

    const fit = computeSlotFit(item.slot_duration_seconds, filled ? item.planned_duration_seconds : 0);
    if (fit.overSeconds > 0) {
      overCount++;
      totalOverSeconds += fit.overSeconds;
    }
  }

  return {
    totalItems: items.length,
    filledItems,
    emptyRequiredItems,
    overCount,
    totalOverSeconds,
    ready: emptyRequiredItems === 0 && overCount === 0,
  };
}
