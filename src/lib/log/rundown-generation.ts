// Pure rundown-generation logic — no Supabase import, colocated test. Given
// a clock version's local opportunities (WUWF's own overlay — see
// lib/log/local-opportunities.ts and 20260808120000_log_local_opportunities.sql,
// slot-keyed as of 20260809170000_log_local_opportunities_slot_based.sql —
// see CLAUDE.md's dated note) and a shift's start time/length, produces the
// draft log_rundown_breaks rows generation should insert. See
// docs/log-design.md §4B (Workflow E) and CLAUDE.md's "the clock template
// repeats each hour" note on log_schedule.duration_minutes.
//
// Every local opportunity gets a break — including optional ones — because
// the break itself is what the builder and console render ("carrying
// network" if nothing gets placed in it). What generation does NOT do is
// manufacture a break for a network slot with no local opportunity marked
// against it: an opportunity is now always slot-keyed, so this function
// never sees the network clock's own automatic majority at all. See the
// clock face diagram (lib/log/clock-face.ts) for the full network
// structure, opportunities included, rendered for context.

import type { LogOpportunityRequirement } from "@/lib/database.types";

// Slot-keyed (2026-08-10): an opportunity's offset/duration/label/timing are
// always its referenced network slot's own — never hand-typed, never able to
// drift out of sync with the clock. slot_position is the slot's own
// position, reused as this opportunity's stable ordering key now that the
// opportunity itself carries no position of its own.
export interface RundownOpportunityLike {
  id: string;
  /** The network slot this opportunity marks — with the hour, a break's identity. */
  slot_id: string;
  slot_position: number;
  slot_label: string | null;
  requirement: LogOpportunityRequirement;
  timing_mode: "fixed" | "float";
  start_offset_seconds: number | null;
  duration_seconds: number;
  earliest_start_offset_seconds: number | null;
  latest_start_offset_seconds: number | null;
  permitted_content_types: string[];
}

/** The timing fields a network slot and an opportunity (which carries its slot's) share. */
export type SlotTimingLike = Pick<
  RundownOpportunityLike,
  | "timing_mode"
  | "start_offset_seconds"
  | "duration_seconds"
  | "earliest_start_offset_seconds"
  | "latest_start_offset_seconds"
>;

export interface RundownBreakDraft {
  clock_slot_id: string;
  local_opportunity_id: string;
  hour_index: number;
  position: number;
  label: string;
  requirement: LogOpportunityRequirement;
  permitted_content_types: string[];
  scheduled_at: string;
  available_duration_seconds: number;
  network_rejoin_at: string;
}

/**
 * The nominal start offset used to place a break on the timeline: a fixed
 * opportunity's own offset, or a floating one's earliest permitted start
 * (a sensible default position before a producer/host decides exactly
 * where within the window to land — same convention log_clock_slots'
 * floating network elements already use).
 */
export function nominalStartOffsetSeconds(opportunity: SlotTimingLike): number {
  if (opportunity.timing_mode === "float") {
    return opportunity.earliest_start_offset_seconds ?? opportunity.start_offset_seconds ?? 0;
  }
  return opportunity.start_offset_seconds ?? 0;
}

/**
 * The latest moment WUWF may still be on local content before the network
 * must be rejoined: start + duration for a fixed opportunity, or the
 * latest permitted start + duration for a floating one (the worst case —
 * a float window that starts as late as possible still needs its full
 * duration before rejoining).
 */
export function rejoinOffsetSeconds(opportunity: SlotTimingLike): number {
  if (opportunity.timing_mode === "float") {
    const latest = opportunity.latest_start_offset_seconds ?? opportunity.start_offset_seconds ?? 0;
    return latest + opportunity.duration_seconds;
  }
  return (opportunity.start_offset_seconds ?? 0) + opportunity.duration_seconds;
}

/**
 * Builds one draft break per local opportunity, repeated once per hour
 * across the shift (a clock template describes a single hour; a
 * multi-hour air block — e.g. Morning Edition's four hours — repeats it).
 * `shiftDurationMinutes` is rounded up to a whole number of hours so a
 * not-quite-hour-aligned shift still gets its final partial hour's
 * opportunities rather than silently dropping them.
 */
export function buildRundownBreakDrafts(
  opportunities: RundownOpportunityLike[],
  shiftStartAtISO: string,
  shiftDurationMinutes: number,
): RundownBreakDraft[] {
  const hours = Math.max(1, Math.ceil(shiftDurationMinutes / 60));
  const shiftStartMs = new Date(shiftStartAtISO).getTime();

  const drafts: RundownBreakDraft[] = [];
  for (let hourIndex = 0; hourIndex < hours; hourIndex++) {
    for (const opportunity of opportunities) {
      const startSeconds = hourIndex * 3600 + nominalStartOffsetSeconds(opportunity);
      const rejoinSeconds = hourIndex * 3600 + rejoinOffsetSeconds(opportunity);
      drafts.push({
        clock_slot_id: opportunity.slot_id,
        local_opportunity_id: opportunity.id,
        hour_index: hourIndex,
        position: hourIndex * 10_000 + opportunity.slot_position,
        label: opportunity.slot_label ?? "Local opportunity",
        requirement: opportunity.requirement,
        permitted_content_types: opportunity.permitted_content_types,
        scheduled_at: new Date(shiftStartMs + startSeconds * 1000).toISOString(),
        available_duration_seconds: opportunity.duration_seconds,
        network_rejoin_at: new Date(shiftStartMs + rejoinSeconds * 1000).toISOString(),
      });
    }
  }
  return drafts;
}

export interface ExistingBreakLike {
  clock_slot_id: string;
  hour_index: number;
}

/**
 * Filters a full draft set down to the ones with no existing break — the
 * additive counterpart to buildRundownBreakDrafts, used when a rundown was
 * generated before a producer added (or a migration seeded) a local
 * opportunity its clock version didn't have yet. A break is one occurrence
 * of one clock slot, so a draft and an existing break are the same
 * occurrence exactly when they share (clock_slot_id, hour_index) — the
 * table's unique key since 20260924140000_log_slot_keyed_breaks.sql. No
 * times are compared: the old instant comparison (a string-vs-instant bug
 * once tripled a rundown's breaks) and the window-overlap match imported
 * rundowns needed are both gone with it. A slot an import already placed
 * something in, and which a producer marks afterward, is simply already
 * present. See docs/log-slot-keyed-breaks-design.md.
 *
 * Never modifies or removes an existing break — safe to call on every page
 * load, and safe to re-run.
 */
export function selectMissingBreakDrafts(
  drafts: RundownBreakDraft[],
  existingBreaks: ExistingBreakLike[],
): RundownBreakDraft[] {
  const existingKeys = new Set(existingBreaks.map((brk) => `${brk.clock_slot_id}|${brk.hour_index}`));
  return drafts.filter((draft) => !existingKeys.has(`${draft.clock_slot_id}|${draft.hour_index}`));
}

/**
 * The row a draft inserts: its identity and the opportunity's snapshot
 * columns. Times, label and position are left out on purpose —
 * log_derive_rundown_break_times() derives them from the slot on every
 * write, so nothing a caller computes can drift from the clock.
 */
export function breakInsertRow(draft: RundownBreakDraft, rundownId: string) {
  return {
    rundown_id: rundownId,
    clock_slot_id: draft.clock_slot_id,
    hour_index: draft.hour_index,
    local_opportunity_id: draft.local_opportunity_id,
    requirement: draft.requirement,
    permitted_content_types: draft.permitted_content_types,
  };
}

/** The unique key a break upsert conflicts on. */
export const BREAK_OCCURRENCE_CONFLICT = "rundown_id,clock_slot_id,hour_index";
