// Aligning an imported program log's breaks to the program's clock — pure,
// no Supabase, colocated test. See docs/log-design.md §8's 2026-09-24
// revision.
//
// The clock defines every break's window; the export decides what goes in
// it. The model reads the export into breaks at DAD's printed times and
// windows (program-log-plan.ts), and this module moves what those breaks
// hold onto the clock:
//
// - Every marked local opportunity gets its break, exactly as rundown
//   generation builds it (rundown-generation.ts), so an imported rundown
//   and a generated one have the same opportunity breaks and opportunity
//   assignments (the legal ID pin) apply to both.
// - An export break that starts at a network slot (within a few seconds —
//   DAD prints the 49:34 window as :49:35) lands in that slot's break: the
//   opportunity's if the slot is marked, otherwise a break with the slot's
//   own clock times. The export prevails on *whether* something airs
//   there — a credit DAD scheduled into a slot nobody marked is still
//   placed — but never on *when* the window is. An unmarked slot's break
//   runs on through the contiguous slots the export's window covers (1A's
//   18:30 avail is a 30s music bed then a 60s promo), still on clock
//   boundaries.
// - An export break that starts inside a short slot (BirdNote printed 30s
//   into a 90s music bed another credit opened) joins that slot's break.
// - A floating slot takes an export break anywhere in its window, placed
//   at the export's time — where a float lands is exactly what a log
//   records.
// - Only where the clock has no avail-sized slot at that point (a
//   placeholder "program content" clock, BBC's 23-minute segment) does the
//   export's own window become the break.
//
// An export avail with nothing in it creates no break: an empty window the
// clock doesn't mark is not something a host needs to see.

import type { LogOpportunityRequirement } from "@/lib/database.types";
import {
  importedBreakPermittedTypes,
  IMPORTED_BREAK_REQUIREMENT,
  secondsToClockTime,
  type BreakPlacement,
  type BreakPlan,
  type ItemPlan,
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

interface Occurrence {
  key: string;
  slot: AlignmentSlot;
  opportunity: AlignmentOpportunity | null;
  hourIndex: number;
  /** Seconds from shift start — a float's earliest start. */
  start: number;
  /** Seconds from shift start — a float's latest start plus its duration. */
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

export function alignBreaksToClock(input: ClockAlignmentInput): BreakPlan[] {
  const { shiftStartSeconds, slots } = input;
  const hours = Math.max(1, Math.ceil(input.shiftDurationMinutes / 60));
  const opportunityBySlot = new Map(input.opportunities.map((opp) => [opp.slot_id, opp]));

  const occurrences: Occurrence[] = [];
  for (let hourIndex = 0; hourIndex < hours; hourIndex++) {
    for (const slot of slots) {
      const start = hourIndex * 3600 + nominalStartOffsetSeconds(slot);
      occurrences.push({
        key: `${slot.id}|${hourIndex}`,
        slot,
        opportunity: opportunityBySlot.get(slot.id) ?? null,
        hourIndex,
        start,
        end: hourIndex * 3600 + rejoinOffsetSeconds(slot),
        latestStart:
          hourIndex * 3600 + (slot.latest_start_offset_seconds ?? slot.start_offset_seconds ?? 0),
      });
    }
  }
  const fixed = occurrences
    .filter((occ) => occ.slot.timing_mode === "fixed")
    .sort((a, b) => a.start - b.start);
  const floats = occurrences.filter((occ) => occ.slot.timing_mode === "float");

  const breaks = new Map<string, BreakPlan>();
  // Which break an occurrence swallowed into a longer unmarked run belongs to.
  const breakKeyByOccurrence = new Map<string, string>();

  const breakFor = (placement: Omit<BreakPlacement, "exportTimes">, label: string): BreakPlan => ({
    startSeconds: shiftStartSeconds + placement.offsetSeconds,
    time: secondsToClockTime(shiftStartSeconds + placement.offsetSeconds),
    label,
    availableDurationSeconds: placement.rejoinOffsetSeconds - placement.offsetSeconds,
    items: [],
    placement: { ...placement, exportTimes: [] },
  });

  // Every marked opportunity, whether or not the export uses it.
  for (const occ of occurrences) {
    if (!occ.opportunity) continue;
    breaks.set(
      occ.key,
      breakFor(
        {
          source: "opportunity",
          localOpportunityId: occ.opportunity.id,
          hourIndex: occ.hourIndex,
          position: occ.hourIndex * 10_000 + occ.slot.position,
          offsetSeconds: occ.start,
          rejoinOffsetSeconds: occ.end,
          requirement: occ.opportunity.requirement,
          permittedContentTypes: occ.opportunity.permitted_content_types,
        },
        occ.slot.label ?? "Local opportunity",
      ),
    );
    breakKeyByOccurrence.set(occ.key, occ.key);
  }

  const unmarkedSlotBreak = (occ: Occurrence, start: number, end: number): string => {
    const existing = breakKeyByOccurrence.get(occ.key);
    if (existing) return existing;
    breaks.set(
      occ.key,
      breakFor(
        {
          source: "clock_slot",
          localOpportunityId: null,
          hourIndex: occ.hourIndex,
          position: occ.hourIndex * 10_000 + occ.slot.position,
          offsetSeconds: start,
          rejoinOffsetSeconds: end,
          requirement: IMPORTED_BREAK_REQUIREMENT,
          permittedContentTypes: importedBreakPermittedTypes(),
        },
        occ.slot.label ?? "Network slot",
      ),
    );
    breakKeyByOccurrence.set(occ.key, occ.key);
    return occ.key;
  };

  let exportBreakCount = 0;
  const sortedExport = [...input.exportBreaks].sort((a, b) => a.startSeconds - b.startSeconds);
  for (const exportBreak of sortedExport) {
    if (exportBreak.items.length === 0) continue;
    const t = exportBreak.startSeconds - shiftStartSeconds;
    const window = Math.max(1, exportBreak.availableDurationSeconds);
    const fits = (occ: Occurrence) =>
      occ.opportunity !== null || isAvailSized(occ.end - occ.start, window);

    let key: string | null = null;

    // 1. A fixed slot starting where the export's break starts.
    const startMatches = fixed
      .filter((occ) => Math.abs(occ.start - t) <= SLOT_START_TOLERANCE_SECONDS && fits(occ))
      .sort(
        (a, b) =>
          Math.abs(a.start - t) - Math.abs(b.start - t) ||
          Number(b.opportunity !== null) - Number(a.opportunity !== null),
      );
    const startMatch = startMatches[0];
    if (startMatch) {
      key = breakKeyByOccurrence.get(startMatch.key) ?? null;
      if (!key) {
        // Run on through the contiguous unmarked slots the export's window
        // covers, stopping at a marked opportunity (its own break).
        let end = startMatch.end;
        const run = [startMatch];
        for (const next of fixed) {
          if (next.start <= startMatch.start || run.includes(next)) continue;
          if (Math.abs(next.start - end) > 2) continue;
          if (next.start >= t + window - SLOT_START_TOLERANCE_SECONDS) break;
          if (next.opportunity || breakKeyByOccurrence.has(next.key)) break;
          if (!isAvailSized(next.end - startMatch.start, window)) break;
          run.push(next);
          end = next.end;
        }
        key = unmarkedSlotBreak(startMatch, startMatch.start, end);
        for (const occ of run) breakKeyByOccurrence.set(occ.key, key);
      }
    }

    // 2. A floating slot whose window the export's time falls in.
    if (!key) {
      const float = floats.find(
        (occ) =>
          t >= occ.start - SLOT_START_TOLERANCE_SECONDS &&
          t <= occ.latestStart + SLOT_START_TOLERANCE_SECONDS,
      );
      if (float) {
        key = breakKeyByOccurrence.get(float.key) ?? null;
        if (!key) {
          const landing = Math.min(Math.max(t, float.start), float.latestStart);
          key = unmarkedSlotBreak(float, landing, landing + float.slot.duration_seconds);
        }
      }
    }

    // 3. A short fixed slot the export's time falls inside.
    if (!key) {
      const containing = fixed
        .filter((occ) => occ.start <= t && t < occ.end && fits(occ))
        .sort(
          (a, b) =>
            Number(b.opportunity !== null) - Number(a.opportunity !== null) ||
            a.end - a.start - (b.end - b.start),
        )[0];
      if (containing) {
        key =
          breakKeyByOccurrence.get(containing.key) ??
          unmarkedSlotBreak(containing, containing.start, containing.end);
      }
    }

    // 4. Nothing on the clock there: the export's own window.
    if (!key) {
      key = `export|${t}`;
      if (!breaks.has(key)) {
        const hourIndex = Math.max(0, Math.floor(t / 3600));
        breaks.set(
          key,
          breakFor(
            {
              source: "export",
              localOpportunityId: null,
              hourIndex,
              position: hourIndex * 10_000 + 5_000 + ++exportBreakCount,
              offsetSeconds: t,
              rejoinOffsetSeconds: t + window,
              requirement: IMPORTED_BREAK_REQUIREMENT,
              permittedContentTypes: importedBreakPermittedTypes(),
            },
            exportBreak.label,
          ),
        );
      }
    }

    const target = breaks.get(key)!;
    target.items.push(...exportBreak.items);
    const placement = target.placement!;
    placement.exportTimes.push(exportBreak.time);
    for (const type of requiredTypesFor(exportBreak.items)) {
      if (!placement.permittedContentTypes.includes(type)) {
        placement.permittedContentTypes = [...placement.permittedContentTypes, type];
      }
    }
  }

  return [...breaks.values()].sort(
    (a, b) => a.startSeconds - b.startSeconds || a.placement!.position - b.placement!.position,
  );
}
