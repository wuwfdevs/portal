// Aligning an imported program log's breaks to the program's clock — pure,
// no Supabase, colocated test. See docs/log-slot-keyed-breaks-design.md
// and docs/log-design.md §8's 2026-09-24 revision.
//
// A rundown break is one occurrence of one clock slot:
// (clock_slot_id, hour_index), with its times derived from the slot by
// log_derive_rundown_break_times(). The clock defines every break's window;
// the export decides what goes in it. The model reads the export into
// breaks at DAD's printed times (program-log-plan.ts), and this module
// finds the slot occurrence each one belongs to:
//
// - Every marked local opportunity gets its break, exactly as rundown
//   generation builds it (rundown-generation.ts), so an imported rundown
//   and a generated one have the same opportunity breaks, and opportunity
//   assignments (the legal ID pin) apply to both.
// - An export break that starts at a fixed slot (within a few seconds —
//   DAD prints the 49:34 window as :49:35) lands in that slot's break: the
//   opportunity's if the slot is marked, otherwise a break for the unmarked
//   slot. The export prevails on *whether* something airs there — a credit
//   DAD scheduled into a slot nobody marked is still placed — but never on
//   the window, which is always the slot's. A DAD avail that covers more
//   than one slot puts its items in the first; the timing engine carries
//   the overrun into the next break if there is one, or reports it.
// - An export break that starts inside a short slot (BirdNote printed 30s
//   into a 90s music bed another credit opened) joins that slot's break.
// - A floating slot takes an export break anywhere in its window, landing
//   at the export's time — where a float lands is what a log records.
// - Where the clock has no avail-sized slot at that point (a placeholder
//   "program content" clock, BBC's 23-minute segment) nothing is created:
//   the row is reported as unresolved, for a host to place by hand if it
//   aired, or a producer to give the program a real clock or mark a slot.
//
// An export avail with nothing in it creates no break.

import type { LogOpportunityRequirement } from "@/lib/database.types";
import {
  importedBreakPermittedTypes,
  IMPORTED_BREAK_REQUIREMENT,
  secondsToClockTime,
  type BreakPlacement,
  type BreakPlan,
  type ItemPlan,
  type UnresolvedEvent,
} from "@/lib/log/program-log-plan";
import {
  nominalStartOffsetSeconds,
  rejoinOffsetSeconds,
  type SlotTimingLike,
} from "@/lib/log/rundown-generation";

/** How far DAD's printed start may sit from a slot's own and still be that slot. */
export const SLOT_START_TOLERANCE_SECONDS = 15;

export interface AlignmentSlot extends SlotTimingLike {
  id: string;
  position: number;
  label: string | null;
}

export interface AlignmentOpportunity {
  id: string;
  slot_id: string;
  requirement: LogOpportunityRequirement;
  permitted_content_types: string[];
}

export interface ClockAlignmentInput {
  exportBreaks: BreakPlan[];
  /** Station-local seconds from midnight the shift starts at. */
  shiftStartSeconds: number;
  shiftDurationMinutes: number;
  slots: AlignmentSlot[];
  opportunities: AlignmentOpportunity[];
}

export interface ClockAlignmentResult {
  breaks: BreakPlan[];
  /** Export rows with items that land on no avail-sized slot. */
  unresolved: UnresolvedEvent[];
}

interface Occurrence {
  key: string;
  slot: AlignmentSlot;
  opportunity: AlignmentOpportunity | null;
  hourIndex: number;
  /** Seconds from shift start — a float's earliest start. */
  start: number;
  /** Seconds from shift start the network is rejoined by. */
  end: number;
  /** A float's latest permitted start, seconds from shift start. */
  latestStart: number;
}

/**
 * The longest slot that still reads as an avail for an export window of
 * `windowSeconds`: generous enough for a 115s music bed under a 90s DAD
 * window, far short of a 23-minute program segment under a 30s one.
 */
function isAvailSized(durationSeconds: number, windowSeconds: number): boolean {
  return durationSeconds <= Math.max(2 * windowSeconds, windowSeconds + 60);
}

function requiredTypesFor(items: ItemPlan[]): string[] {
  return items.some((item) => item.kind === "credit") ? ["underwriting_credit"] : [];
}

export function alignBreaksToClock(input: ClockAlignmentInput): ClockAlignmentResult {
  const { shiftStartSeconds, slots } = input;
  const hours = Math.max(1, Math.ceil(input.shiftDurationMinutes / 60));
  const opportunityBySlot = new Map(input.opportunities.map((opp) => [opp.slot_id, opp]));

  const occurrences: Occurrence[] = [];
  for (let hourIndex = 0; hourIndex < hours; hourIndex++) {
    for (const slot of slots) {
      occurrences.push({
        key: `${slot.id}|${hourIndex}`,
        slot,
        opportunity: opportunityBySlot.get(slot.id) ?? null,
        hourIndex,
        start: hourIndex * 3600 + nominalStartOffsetSeconds(slot),
        end: hourIndex * 3600 + rejoinOffsetSeconds(slot),
        latestStart:
          hourIndex * 3600 + (slot.latest_start_offset_seconds ?? slot.start_offset_seconds ?? 0),
      });
    }
  }
  const fixed = occurrences.filter((occ) => occ.slot.timing_mode === "fixed");
  const floats = occurrences.filter((occ) => occ.slot.timing_mode === "float");

  const breaks = new Map<string, BreakPlan>();

  const breakFor = (occ: Occurrence, landingOffsetSeconds: number | null): BreakPlan => {
    const offsetSeconds =
      landingOffsetSeconds === null ? occ.start : occ.hourIndex * 3600 + landingOffsetSeconds;
    const placement: BreakPlacement = {
      source: occ.opportunity ? "opportunity" : "clock_slot",
      clockSlotId: occ.slot.id,
      localOpportunityId: occ.opportunity?.id ?? null,
      hourIndex: occ.hourIndex,
      landingOffsetSeconds,
      position: occ.hourIndex * 10_000 + occ.slot.position,
      offsetSeconds,
      rejoinOffsetSeconds: occ.end,
      requirement: occ.opportunity?.requirement ?? IMPORTED_BREAK_REQUIREMENT,
      permittedContentTypes: occ.opportunity
        ? occ.opportunity.permitted_content_types
        : importedBreakPermittedTypes(),
      exportTimes: [],
    };
    return {
      startSeconds: shiftStartSeconds + offsetSeconds,
      time: secondsToClockTime(shiftStartSeconds + offsetSeconds),
      label: occ.slot.label ?? (occ.opportunity ? "Local opportunity" : "Network slot"),
      availableDurationSeconds: occ.slot.duration_seconds,
      items: [],
      placement,
    };
  };

  const breakAt = (occ: Occurrence, landingOffsetSeconds: number | null = null): BreakPlan => {
    let brk = breaks.get(occ.key);
    if (!brk) {
      brk = breakFor(occ, landingOffsetSeconds);
      breaks.set(occ.key, brk);
    }
    return brk;
  };

  // Every marked opportunity, whether or not the export uses it.
  for (const occ of occurrences) {
    if (occ.opportunity) breakAt(occ);
  }

  const unresolved: UnresolvedEvent[] = [];
  const sortedExport = [...input.exportBreaks].sort((a, b) => a.startSeconds - b.startSeconds);
  for (const exportBreak of sortedExport) {
    if (exportBreak.items.length === 0) continue;
    const t = exportBreak.startSeconds - shiftStartSeconds;
    const window = Math.max(1, exportBreak.availableDurationSeconds);
    const fits = (occ: Occurrence) =>
      occ.opportunity !== null || isAvailSized(occ.end - occ.start, window);

    let target: BreakPlan | null = null;

    // 1. A fixed slot starting where the export's break starts.
    const startMatch = fixed
      .filter((occ) => Math.abs(occ.start - t) <= SLOT_START_TOLERANCE_SECONDS && fits(occ))
      .sort(
        (a, b) =>
          Math.abs(a.start - t) - Math.abs(b.start - t) ||
          Number(b.opportunity !== null) - Number(a.opportunity !== null),
      )[0];
    if (startMatch) target = breakAt(startMatch);

    // 2. A floating slot whose window the export's time falls in.
    if (!target) {
      const float = floats.find(
        (occ) =>
          t >= occ.start - SLOT_START_TOLERANCE_SECONDS &&
          t <= occ.latestStart + SLOT_START_TOLERANCE_SECONDS,
      );
      if (float) {
        const landing =
          Math.min(Math.max(t, float.start), float.latestStart) - float.hourIndex * 3600;
        const earliest = float.start - float.hourIndex * 3600;
        target = breakAt(float, landing === earliest ? null : landing);
      }
    }

    // 3. A short fixed slot the export's time falls inside.
    if (!target) {
      const containing = fixed
        .filter((occ) => occ.start <= t && t < occ.end && fits(occ))
        .sort(
          (a, b) =>
            Number(b.opportunity !== null) - Number(a.opportunity !== null) ||
            a.end - a.start - (b.end - b.start),
        )[0];
      if (containing) target = breakAt(containing);
    }

    // 4. Nothing on the clock there.
    if (!target) {
      for (const item of exportBreak.items) {
        unresolved.push({
          time: exportBreak.time,
          description: item.title,
          reason:
            "No clock slot this program's clock marks, or that's short enough to be a break, starts here. Give the program its real clock or mark a slot, then place it by hand if it aired.",
        });
      }
      continue;
    }

    target.items.push(...exportBreak.items);
    const placement = target.placement!;
    placement.exportTimes.push(exportBreak.time);
    for (const type of requiredTypesFor(exportBreak.items)) {
      if (!placement.permittedContentTypes.includes(type)) {
        placement.permittedContentTypes = [...placement.permittedContentTypes, type];
      }
    }
  }

  const sorted = [...breaks.values()].sort(
    (a, b) => a.startSeconds - b.startSeconds || a.placement!.position - b.placement!.position,
  );
  return { breaks: sorted, unresolved };
}
