// Fulfillment, description, and review for the redesigned schedule line
// (docs/underwriting-traffic-redesign.md §9). Pure: no Supabase import,
// colocated tests built from the real orders in fixtures/insertion-orders.ts.
//
// A line is eligibility; its demand buckets (compiled by demand-compiler.ts)
// say how many credits are owed in each period. Everything here counts per
// bucket: a placement records which bucket it consumes
// (uw_scheduled_placements.demand_bucket_id), a makegood placement carries
// the missed placement's bucket, so a miss and its replacement are one
// contractual credit, never two.

import type { UwScheduleEntryKind, UwServiceLevel, UwTimeMode } from "@/lib/database.types";
import {
  describeDays,
  describeEntrySpec,
  parseEntrySpec,
  totalQuantity,
  type EntrySpec,
} from "./demand-compiler";
import { addDays, dayOfWeek, shortDate } from "./dates";
import { eligibleDatesInBucket, type BucketLike, type LineEligibilityLike } from "./eligibility";

export { addDays, dayOfWeek, isValidDateISO, weekStartOf } from "./dates";
export { describeDays } from "./demand-compiler";

export interface ScheduleLineLike extends LineEligibilityLike {
  id?: string;
  entry_kind: UwScheduleEntryKind;
  entry_spec: unknown;
  service_level: UwServiceLevel;
  stated_total: number | null;
}

export interface DemandBucketLike extends BucketLike {
  source_label: string | null;
}

// Per-bucket fulfillment -----------------------------------------------------

export type PlacementOutcome = "pending" | "aired" | "not_aired";

export interface PlacementForFulfillment {
  bucketId: string;
  isMakegood: boolean;
  /** No broadcast event yet, aired as scheduled, or anything else (missed, skipped, …). */
  outcome: PlacementOutcome;
}

export interface MakegoodForFulfillment {
  bucketId: string | null;
  /** Scheduled with no slot chosen yet. */
  awaitingSlot: boolean;
}

export interface BucketFulfillment {
  bucketId: string;
  periodStart: string;
  periodEnd: string;
  sourceLabel: string;
  quantity: number;
  status: DemandBucketLike["status"];
  /** Dates within the bucket a credit may air on under the line's eligibility. */
  eligibleDates: string[];
  /** Fresh (non-makegood) placements with no outcome yet. */
  scheduled: number;
  /** Fresh placements confirmed aired as scheduled. */
  aired: number;
  /** Fresh placements whose outcome was anything but aired as scheduled. */
  missed: number;
  makegoodsAwaitingSlot: number;
  makegoodsScheduled: number;
  makegoodsAired: number;
  /** Fresh units the bucket still needs: quantity minus every fresh placement, whatever its outcome (a missed one is replaced through its makegood, never re-sold as fresh demand). Matches log_place_underwriting_credit()'s quota check. */
  freshShortfall: number;
  /** Airings that actually count toward the order: aired fresh plus aired makegoods. */
  delivered: number;
}

export function computeBucketFulfillment(
  line: LineEligibilityLike,
  buckets: DemandBucketLike[],
  placements: PlacementForFulfillment[],
  makegoods: MakegoodForFulfillment[] = [],
): BucketFulfillment[] {
  return [...buckets]
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
    .map((bucket) => {
      const own = placements.filter((placement) => placement.bucketId === bucket.id);
      const fresh = own.filter((placement) => !placement.isMakegood);
      const mg = own.filter((placement) => placement.isMakegood);
      const aired = fresh.filter((p) => p.outcome === "aired").length;
      const makegoodsAired = mg.filter((p) => p.outcome === "aired").length;
      return {
        bucketId: bucket.id,
        periodStart: bucket.period_start,
        periodEnd: bucket.period_end,
        sourceLabel: bucket.source_label ?? describeBucketPeriod(bucket),
        quantity: bucket.quantity_required,
        status: bucket.status,
        eligibleDates: eligibleDatesInBucket(line, bucket),
        scheduled: fresh.filter((p) => p.outcome === "pending").length,
        aired,
        missed: fresh.filter((p) => p.outcome === "not_aired").length,
        makegoodsAwaitingSlot: makegoods.filter(
          (makegood) => makegood.awaitingSlot && makegood.bucketId === bucket.id,
        ).length,
        makegoodsScheduled: mg.filter((p) => p.outcome === "pending").length,
        makegoodsAired,
        freshShortfall:
          bucket.status === "active" ? Math.max(0, bucket.quantity_required - fresh.length) : 0,
        delivered: aired + makegoodsAired,
      };
    });
}

export function describeBucketPeriod(
  bucket: Pick<BucketLike, "period_start" | "period_end">,
): string {
  if (bucket.period_start === bucket.period_end) return shortDate(bucket.period_start);
  if (addDays(bucket.period_start, 6) === bucket.period_end && dayOfWeek(bucket.period_start) === 1)
    return `week of ${shortDate(bucket.period_start)}`;
  return `${shortDate(bucket.period_start)} – ${shortDate(bucket.period_end)}`;
}

export type FulfillmentStatus = "no_target" | "on_track" | "behind" | "fulfilled";

export interface LineFulfillmentSummary {
  status: FulfillmentStatus;
  /** Bonus weight: reported, never "behind" (docs/underwriting-traffic-redesign.md §9). */
  bonus: boolean;
  expected: number;
  delivered: number;
  scheduled: number;
  missed: number;
  freshShortfall: number;
  /** Active buckets that ended before todayISO with fewer deliveries than expected and nothing still scheduled to cover them. */
  bucketsBehind: number;
}

/**
 * A line is fulfilled once every active bucket is delivered in full with no
 * exception or makegood still open; behind when a bucket already in the
 * past is short or something is unresolved; on track otherwise. A bonus
 * line is never behind — an unfilled bonus unit is not owed.
 */
export function summarizeLineFulfillment(
  buckets: BucketFulfillment[],
  openItems: { openExceptions: number; openMakegoods: number },
  todayISO: string,
  serviceLevel: UwServiceLevel = "guaranteed",
): LineFulfillmentSummary {
  const active = buckets.filter((b) => b.status === "active");
  const expected = active.reduce((sum, b) => sum + b.quantity, 0);
  const delivered = buckets.reduce((sum, b) => sum + b.delivered, 0);
  const scheduled = buckets.reduce((sum, b) => sum + b.scheduled + b.makegoodsScheduled, 0);
  const missed = buckets.reduce((sum, b) => sum + b.missed, 0);
  const freshShortfall = active.reduce((sum, b) => sum + b.freshShortfall, 0);
  const bucketsBehind = active.filter(
    (b) =>
      b.periodEnd < todayISO &&
      b.delivered + b.scheduled + b.makegoodsScheduled + b.makegoodsAwaitingSlot < b.quantity,
  ).length;
  const hasOpenItems = openItems.openExceptions > 0 || openItems.openMakegoods > 0;
  const bonus = serviceLevel === "bonus";

  let status: FulfillmentStatus;
  if (active.length === 0 || expected === 0) status = "no_target";
  else if (delivered >= expected && (!hasOpenItems || bonus)) status = "fulfilled";
  else if (!bonus && (hasOpenItems || bucketsBehind > 0)) status = "behind";
  else status = "on_track";

  return {
    status,
    bonus,
    expected,
    delivered,
    scheduled,
    missed,
    freshShortfall,
    bucketsBehind,
  };
}

export const FULFILLMENT_STATUS_LABEL: Record<FulfillmentStatus, string> = {
  no_target: "No demand",
  on_track: "On track",
  behind: "Behind",
  fulfilled: "Fulfilled",
};

// Description --------------------------------------------------------------

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":").map((part) => Number.parseInt(part, 10));
  if (h == null || m == null || Number.isNaN(h) || Number.isNaN(m)) return time;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export interface DescribeNames {
  poolName?: string | null;
  programName?: string | null;
}

export function describeTimeMode(
  line: Pick<
    LineEligibilityLike,
    "time_mode" | "preferred_time" | "window_start" | "window_end" | "required_opportunity_key"
  >,
): string {
  switch (line.time_mode) {
    case "any":
      return "";
    case "window":
      return ` between ${formatTime(line.window_start)} and ${formatTime(line.window_end)}`;
    case "preferred":
      return `, around ${formatTime(line.preferred_time)}`;
    case "exact":
      return ` at ${formatTime(line.preferred_time)}`;
    case "slot":
      return ` in the "${line.required_opportunity_key}" position`;
  }
}

/**
 * The order-entry preview: "4 AM Drive credits a week, each weekday, at
 * most 1 a day", "1 Carpool credit each Wed at 8:44 AM", "1 credit every
 * other week, any day", "13 Five Corners credits over the whole run in the
 * "five-corners.opening" position".
 */
export function describeScheduleLine(
  line: Pick<
    ScheduleLineLike,
    | "entry_kind"
    | "entry_spec"
    | "days_of_week"
    | "time_mode"
    | "preferred_time"
    | "window_start"
    | "window_end"
    | "required_opportunity_key"
    | "max_per_day"
    | "service_level"
    | "status"
    | "cancelled_from"
  >,
  names: DescribeNames = {},
): string {
  const where = [names.poolName, names.programName].filter(Boolean).join(" on ") || "credit";
  const spec = parseEntrySpec(line.entry_spec);
  const base = spec
    ? describeEntrySpec(spec, line.days_of_week, where === "credit" ? "credit" : `${where} credit`)
    : `${where}s (${line.entry_kind.replace(/_/g, " ")})`;
  const cap = line.max_per_day != null ? `, at most ${line.max_per_day} a day` : "";
  const bonus = line.service_level === "bonus" ? " (bonus)" : "";
  const cancelled =
    line.status === "cancelled" && line.cancelled_from
      ? ` — cancelled from ${line.cancelled_from}`
      : "";
  return `${base}${describeTimeMode(line)}${cap}${bonus}${cancelled}`;
}

// Review -------------------------------------------------------------------

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ReviewWarning {
  code:
    | "stated_total_mismatch"
    | "partial_period"
    | "start_day_not_eligible"
    | "outside_contract"
    | "date_outside_line"
    | "no_demand"
    | "slot_needs_key"
    | "exact_without_program";
  message: string;
}

/**
 * Things a traffic staffer should look at before trusting a line — never
 * blocking, never silently resolved (brief §3G, §6). The 309 Punk case
 * ("Oct. 3–Oct 23 Friday", where Oct 3 is a Saturday) surfaces as
 * start_day_not_eligible with the first real date named.
 */
export function reviewScheduleLine(
  line: Pick<
    ScheduleLineLike,
    | "entry_kind"
    | "entry_spec"
    | "days_of_week"
    | "start_date"
    | "end_date"
    | "stated_total"
    | "time_mode"
    | "required_opportunity_key"
  > & { program_id?: string | null; pool_id?: string | null },
  buckets: { periodStart: string; periodEnd: string; quantity: number; partial?: boolean }[],
  contract: { effective_from: string; effective_to: string | null },
): ReviewWarning[] {
  const warnings: ReviewWarning[] = [];
  const expected = totalQuantity(buckets);
  const spec = parseEntrySpec(line.entry_spec);

  if (expected === 0) {
    warnings.push({
      code: "no_demand",
      message: "This line compiles to no credits at all — check its dates, days, or quantities.",
    });
  }
  if (line.stated_total != null && line.stated_total !== expected) {
    warnings.push({
      code: "stated_total_mismatch",
      message: `The order states ${line.stated_total} but the schedule as entered comes to ${expected}.`,
    });
  }
  const partial = buckets.filter((b) => b.partial);
  if (partial.length > 0) {
    warnings.push({
      code: "partial_period",
      message: `${partial.length} period${partial.length === 1 ? " is" : "s are"} only partly inside the line's dates (${partial.map((b) => b.periodStart).join(", ")}) — counted at the full quantity, not prorated.`,
    });
  }
  // Only a fixed-days line makes a claim about its start date; a weekly
  // quota that starts on a Monday and airs weekends is the normal case.
  if (
    line.entry_kind === "fixed_days" &&
    line.days_of_week.length > 0 &&
    !line.days_of_week.includes(dayOfWeek(line.start_date))
  ) {
    const first = buckets[0]?.periodStart;
    warnings.push({
      code: "start_day_not_eligible",
      message: `The line starts on a ${DAY_LABEL[dayOfWeek(line.start_date)]} (${line.start_date}) but airs ${describeDays(line.days_of_week)}${first ? ` — the first credit falls on ${first}` : ""}.`,
    });
  }
  const lineEnd = line.end_date ?? buckets[buckets.length - 1]?.periodEnd ?? null;
  if (
    line.start_date < contract.effective_from ||
    (contract.effective_to != null && lineEnd != null && lineEnd > contract.effective_to)
  ) {
    warnings.push({
      code: "outside_contract",
      message: `The line's dates (${line.start_date}${lineEnd ? ` – ${lineEnd}` : ""}) run outside the contract's (${contract.effective_from}${contract.effective_to ? ` – ${contract.effective_to}` : ""}).`,
    });
  }
  const listed: string[] =
    spec?.kind === "explicit_dates"
      ? spec.dates.map((d) => d.date)
      : spec?.kind === "week_grid"
        ? spec.weeks.map((w) => w.week_start)
        : [];
  const stray = listed.filter(
    (date) =>
      (spec?.kind === "week_grid" ? addDays(date, 6) : date) < line.start_date ||
      (line.end_date != null && date > line.end_date),
  );
  if (stray.length > 0) {
    warnings.push({
      code: "date_outside_line",
      message: `${stray.length} listed ${spec?.kind === "week_grid" ? "week" : "date"}${stray.length === 1 ? "" : "s"} fall outside the line's own start/end and were dropped (${stray.join(", ")}).`,
    });
  }
  if (line.time_mode === "slot" && !line.required_opportunity_key) {
    warnings.push({
      code: "slot_needs_key",
      message: "A position-specific line needs the Log traffic key of the opportunity it targets.",
    });
  }
  if (line.time_mode === "exact" && !line.program_id && !line.pool_id) {
    warnings.push({
      code: "exact_without_program",
      message: "An exact-time line should name the program (or pool) the time belongs to.",
    });
  }
  return warnings;
}

export type { EntrySpec, UwTimeMode };
