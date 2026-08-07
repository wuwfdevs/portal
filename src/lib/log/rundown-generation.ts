// Pure rundown-generation logic — no Supabase import, colocated test. Given
// a clock version's slots and a shift's start time/length, produces the
// draft log_rundown_items rows generation should insert. See
// docs/log-design.md §4.2/§11 (Workflow E) and CLAUDE.md's "the clock
// template repeats each hour" note on log_schedule.duration_minutes.
//
// Only slots a host actually decides something about get a row: fill_mode =
// 'required' slots are the network feed itself (assignment_mode =
// 'automatic' for every one of them in this tool's real seed data) — there
// is no content_item to pick and nothing for a rundown_item to represent, so
// generation leaves them out entirely rather than manufacturing a row with a
// null content_item_id for something nobody will ever fill. The clock face
// diagram (lib/log/clock-face.ts) already renders the full clock, required
// slots included, for context.

import type { LogRequirementLevel, LogSlotFillMode } from "@/lib/database.types";

export interface RundownSlotLike {
  id: string;
  position: number;
  start_offset_seconds: number | null;
  duration_seconds: number;
  fill_mode: LogSlotFillMode;
}

export interface RundownItemDraft {
  clock_slot_id: string;
  hour_index: number;
  position: number;
  scheduled_at: string;
  planned_duration_seconds: number;
  requirement_level: LogRequirementLevel;
}

/**
 * A slot's requirement once placed in a rundown: 'host_fillable' means the
 * break must be filled with *something*, the host just chooses what — that
 * maps to 'required' here, not 'optional'. Only a slot whose own fill_mode
 * is 'optional' (host's discretion whether to use it at all) maps to
 * 'optional'. 'suggested' is a valid requirement_level a producer can
 * override a specific placement to later, but generation never produces it.
 */
export function defaultRequirementLevel(fillMode: LogSlotFillMode): LogRequirementLevel {
  return fillMode === "optional" ? "optional" : "required";
}

/**
 * Builds one draft rundown item per host-decided slot, repeated once per
 * hour across the shift (a clock template describes a single hour; a
 * multi-hour air block — e.g. Morning Edition's four hours — repeats it).
 * `shiftDurationMinutes` is rounded up to a whole number of hours so a
 * not-quite-hour-aligned shift still gets its final partial hour's slots
 * rather than silently dropping them.
 */
export function buildRundownItemDrafts(
  slots: RundownSlotLike[],
  shiftStartAtISO: string,
  shiftDurationMinutes: number,
): RundownItemDraft[] {
  const fillableSlots = slots.filter((slot) => slot.fill_mode !== "required");
  const hours = Math.max(1, Math.ceil(shiftDurationMinutes / 60));
  const shiftStartMs = new Date(shiftStartAtISO).getTime();

  const drafts: RundownItemDraft[] = [];
  for (let hourIndex = 0; hourIndex < hours; hourIndex++) {
    for (const slot of fillableSlots) {
      const offsetSeconds = slot.start_offset_seconds ?? 0;
      const scheduledAtMs = shiftStartMs + (hourIndex * 3600 + offsetSeconds) * 1000;
      drafts.push({
        clock_slot_id: slot.id,
        hour_index: hourIndex,
        position: hourIndex * 10_000 + slot.position,
        scheduled_at: new Date(scheduledAtMs).toISOString(),
        planned_duration_seconds: slot.duration_seconds,
        requirement_level: defaultRequirementLevel(slot.fill_mode),
      });
    }
  }
  return drafts;
}
