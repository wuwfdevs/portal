// Pure aggregation for the local-content inventory report — no Supabase, no
// React, colocated test, mirroring lib/academic-partnerships/dashboard.ts's
// "reduce what queries.ts already reads, no new SQL aggregate" approach.
//
// Two genuinely different questions live here, computed two different ways:
//
//   - "What's configured right now" (computeClockCapacity) is a live,
//     point-in-time read of each program's current clock: how much of one
//     clock cycle is local-eligible vs. protected network time. It has no
//     history, because log_local_opportunities isn't versioned — active is
//     a plain boolean, editable in place — so there is no honest way to ask
//     "what was configured as of three weeks ago." Deliberately scoped to
//     one clock cycle (whatever a version's own total slot duration is, not
//     a projection across a whole scheduled shift): a clock template
//     doesn't say how many times it repeats within a shift on its own (some
//     templates are one hour repeating hourly, Echoes' own template is
//     already two hours matching its program directly) — that repeat count
//     is rundown-generation's own concern (lib/log/rundown-generation.ts),
//     not this report's to reimplement or guess at.
//
//   - "What actually happened" (computeInventoryTrend) is real history,
//     bucketed by week or month, built entirely from generated rundowns and
//     what was placed and confirmed against them. Because log_rundown_
//     breaks snapshots its label/requirement/permitted_content_types at
//     generation time (see log_local_opportunities' own migration note),
//     this is immune to today's opportunity being edited or deactivated
//     later — a real historical record, not a retroactive projection from
//     current config. It only covers programs/dates that actually had a
//     rundown generated; a configured opportunity nobody ever built a
//     rundown against contributes zero history, which is the report's
//     honest answer, not a bug to work around.

import { computeBreakStatuses, type BreakStatus, type SpilloverBreakLike } from "./timing";

export interface CapacitySlotLike {
  duration_seconds: number;
}

export interface CapacityOpportunityLike {
  requirement: "optional" | "required";
  active: boolean;
  slot: CapacitySlotLike;
}

export interface ClockCapacity {
  totalSeconds: number;
  localEligibleSeconds: number;
  requiredSeconds: number;
  networkSeconds: number;
}

/** One clock version's own cycle: total structural length vs. how much of it is currently marked locally eligible. */
export function computeClockCapacity(
  slots: CapacitySlotLike[],
  opportunities: CapacityOpportunityLike[],
): ClockCapacity {
  const totalSeconds = slots.reduce((sum, slot) => sum + slot.duration_seconds, 0);
  const active = opportunities.filter((opportunity) => opportunity.active);
  const localEligibleSeconds = active.reduce((sum, opportunity) => sum + opportunity.slot.duration_seconds, 0);
  const requiredSeconds = active
    .filter((opportunity) => opportunity.requirement === "required")
    .reduce((sum, opportunity) => sum + opportunity.slot.duration_seconds, 0);
  return {
    totalSeconds,
    localEligibleSeconds,
    requiredSeconds,
    networkSeconds: totalSeconds - localEligibleSeconds,
  };
}

export type ReportGranularity = "week" | "month";

/**
 * The bucket a calendar date falls into. Week buckets start Monday and are
 * keyed by that Monday's own date, so buckets sort and dedupe correctly
 * without a separate ISO-week-number library. Month buckets are keyed
 * "YYYY-MM". Pure calendar-date arithmetic, anchored at midnight UTC like
 * this file's siblings in lib/log/timezone.ts — a bare bucket boundary, not
 * a wall-clock instant, so no station-timezone conversion applies here.
 */
export function bucketKeyForDate(dateISO: string, granularity: ReportGranularity): { key: string; startDate: string } {
  if (granularity === "month") {
    const key = dateISO.slice(0, 7);
    return { key, startDate: `${key}-01` };
  }

  const date = new Date(`${dateISO}T00:00:00Z`);
  const dayOfWeek = date.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  const startDate = date.toISOString().slice(0, 10);
  return { key: startDate, startDate };
}

export interface TrendRundownLike {
  id: string;
  program_id: string;
  air_date: string;
  shift_start_at: string;
  shift_end_at: string;
}

export interface TrendBreakLike {
  id: string;
  rundown_id: string;
  requirement: "optional" | "required";
  available_duration_seconds: number;
  scheduled_at: string;
  network_rejoin_at: string;
}

export interface TrendItemLike {
  break_id: string;
  planned_duration_seconds: number;
}

const EMPTY_BREAK_COUNTS: Record<BreakStatus, number> = {
  carrying_network: 0,
  unresolved_required: 0,
  filled: 0,
  over: 0,
  covered_by_previous: 0,
  preempted_by_previous: 0,
};

export interface InventoryBucket {
  key: string;
  startDate: string;
  rundownCount: number;
  totalSeconds: number;
  networkSeconds: number;
  localAvailableSeconds: number;
  localUsedSeconds: number;
  breakCounts: Record<BreakStatus, number>;
}

/**
 * Buckets a set of generated rundowns (with their breaks and placed items)
 * into per-period totals. Time accounting is a clean partition per rundown —
 * networkSeconds + localAvailableSeconds always sums to totalSeconds,
 * because generateRundown only ever creates a break row for a locally-
 * eligible window (lib/log/rundown-generation.ts); everything else in the
 * shift is, by construction, protected network time. Break-status counts
 * reuse computeBreakStatuses (this file's own spillover-aware classifier)
 * per rundown rather than a naive "has an item" check, so a break covered by
 * spillover from the one before it isn't miscounted as a real gap.
 */
export function computeInventoryTrend(
  rundowns: TrendRundownLike[],
  breaks: TrendBreakLike[],
  items: TrendItemLike[],
  granularity: ReportGranularity,
): InventoryBucket[] {
  const itemsByBreak = new Map<string, TrendItemLike[]>();
  for (const item of items) {
    const existing = itemsByBreak.get(item.break_id);
    if (existing) existing.push(item);
    else itemsByBreak.set(item.break_id, [item]);
  }

  const breaksByRundown = new Map<string, TrendBreakLike[]>();
  for (const brk of breaks) {
    const existing = breaksByRundown.get(brk.rundown_id);
    if (existing) existing.push(brk);
    else breaksByRundown.set(brk.rundown_id, [brk]);
  }

  const buckets = new Map<string, InventoryBucket>();

  for (const rundown of rundowns) {
    const { key, startDate } = bucketKeyForDate(rundown.air_date, granularity);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        startDate,
        rundownCount: 0,
        totalSeconds: 0,
        networkSeconds: 0,
        localAvailableSeconds: 0,
        localUsedSeconds: 0,
        breakCounts: { ...EMPTY_BREAK_COUNTS },
      };
      buckets.set(key, bucket);
    }

    const rundownBreaks = breaksByRundown.get(rundown.id) ?? [];
    const totalSeconds = Math.max(
      0,
      (new Date(rundown.shift_end_at).getTime() - new Date(rundown.shift_start_at).getTime()) / 1000,
    );
    const availableSeconds = rundownBreaks.reduce((sum, brk) => sum + brk.available_duration_seconds, 0);

    const spilloverInputs: SpilloverBreakLike[] = rundownBreaks.map((brk) => {
      const brkItems = itemsByBreak.get(brk.id) ?? [];
      return {
        id: brk.id,
        requirement: brk.requirement,
        item_count: brkItems.length,
        available_duration_seconds: brk.available_duration_seconds,
        occupied_duration_seconds: brkItems.reduce((sum, item) => sum + item.planned_duration_seconds, 0),
        scheduled_at: brk.scheduled_at,
        network_rejoin_at: brk.network_rejoin_at,
      };
    });
    const usedSeconds = spilloverInputs.reduce((sum, brk) => sum + brk.occupied_duration_seconds, 0);

    bucket.rundownCount += 1;
    bucket.totalSeconds += totalSeconds;
    bucket.localAvailableSeconds += availableSeconds;
    bucket.localUsedSeconds += usedSeconds;
    bucket.networkSeconds += Math.max(0, totalSeconds - availableSeconds);

    for (const result of computeBreakStatuses(spilloverInputs)) {
      bucket.breakCounts[result.status] += 1;
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.startDate.localeCompare(b.startDate));
}
