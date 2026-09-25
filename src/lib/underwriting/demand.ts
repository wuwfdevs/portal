// Demand expansion for the redesigned schedule lines
// (docs/underwriting-traffic-redesign.md §3–§4). Pure: no Supabase import,
// colocated tests built from the real orders in fixtures/insertion-orders.ts.
//
// A schedule line is one of four typed rule shapes; this module turns one
// into the list of demand *periods* it sells — a calendar day (fixed_days,
// explicit_dates) or a Monday-started broadcast week (weekly_quota,
// week_grid) — each with the dates a credit may air on and how many the
// period needs. Everything downstream keys on the period: a placement
// records which period it consumes (uw_scheduled_placements.demand_period_
// start), fulfillment is counted per period, and the planner fills each
// period's shortfall against real inventory (lib/underwriting/inventory-
// selection.ts). periodForDate() is the TypeScript twin of the SQL guard's
// uw_line_period_for_date(); keep them in step.
//
// Dates are ISO calendar dates in the station's own calendar — an air_date
// is already a date, so there is no timezone math here. Week boundaries are
// Monday–Sunday (the brief's working default; every WUWF order on file
// starts on a Monday and FPM's grid columns are Mondays).

import type {
  UwAllocationPeriodKind,
  UwScheduleLineStatus,
  UwScheduleRuleKind,
} from "@/lib/database.types";

export interface ScheduleRuleLike {
  id?: string;
  rule_kind: UwScheduleRuleKind;
  /** 0=Sunday..6=Saturday. */
  days_of_week: number[];
  count_per_day: number | null;
  quantity_per_week: number | null;
  max_per_day: number | null;
  start_date: string;
  end_date: string | null;
  status: UwScheduleLineStatus;
  cancelled_from: string | null;
}

export interface AllocationLike {
  period_kind: UwAllocationPeriodKind;
  period_start: string;
  quantity: number;
}

export type DemandPeriodKind = "day" | "week";

export interface DemandPeriod {
  kind: DemandPeriodKind;
  /** The period's key — the date, or the Monday of the week. Matches uw_scheduled_placements.demand_period_start. */
  periodStart: string;
  periodEnd: string;
  /** Dates within the period a credit may air on, after the line's range, days, and cancellation are applied. Never empty. */
  eligibleDates: string[];
  quantity: number;
  maxPerDay: number;
  /** A week clipped by the line's own start/end date. Counted at full quota, flagged for review — never prorated (brief §6). */
  partialWeek: boolean;
}

// Date helpers -----------------------------------------------------------------

function toUTC(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00Z`);
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(dateISO: string, days: number): string {
  const date = toUTC(dateISO);
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
}

/** 0=Sunday..6=Saturday, matching log_schedule.days_of_week. */
export function dayOfWeek(dateISO: string): number {
  return toUTC(dateISO).getUTCDay();
}

/** The Monday on or before the date — the broadcast week's key. */
export function weekStartOf(dateISO: string): string {
  const dow = dayOfWeek(dateISO);
  const offset = dow === 0 ? 6 : dow - 1;
  return addDays(dateISO, -offset);
}

export function isValidDateISO(dateISO: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateISO) && !Number.isNaN(toUTC(dateISO).getTime());
}

function* eachDate(startISO: string, endISO: string): Generator<string> {
  for (
    let cursor = toUTC(startISO);
    toISO(cursor) <= endISO;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    yield toISO(cursor);
  }
}

function withinLine(line: ScheduleRuleLike, dateISO: string): boolean {
  if (dateISO < line.start_date) return false;
  if (line.end_date != null && dateISO > line.end_date) return false;
  if (line.status === "cancelled" && line.cancelled_from != null && dateISO >= line.cancelled_from)
    return false;
  return true;
}

// Expansion --------------------------------------------------------------------

export interface ExpandOptions {
  /** For an open-ended line (no end_date): the last date to expand through. Without it an open-ended line expands to nothing. */
  through?: string;
}

/**
 * Every demand period a line sells, in date order. A period whose eligible
 * dates are all outside the line (a cancelled tail, a weekend-only week for a
 * weekday line) is dropped rather than reported with zero dates.
 */
export function expandDemandPeriods(
  line: ScheduleRuleLike,
  allocations: AllocationLike[],
  options: ExpandOptions = {},
): DemandPeriod[] {
  const end = line.end_date ?? options.through ?? null;
  const days = new Set(line.days_of_week);

  switch (line.rule_kind) {
    case "fixed_days": {
      if (end == null || line.count_per_day == null) return [];
      const periods: DemandPeriod[] = [];
      for (const date of eachDate(line.start_date, end)) {
        if (!days.has(dayOfWeek(date)) || !withinLine(line, date)) continue;
        periods.push({
          kind: "day",
          periodStart: date,
          periodEnd: date,
          eligibleDates: [date],
          quantity: line.count_per_day,
          maxPerDay: line.count_per_day,
          partialWeek: false,
        });
      }
      return periods;
    }
    case "weekly_quota": {
      if (end == null || line.quantity_per_week == null) return [];
      return expandWeeks(line, weekStartOf(line.start_date), end, (weekStart) => ({
        quantity: line.quantity_per_week!,
        maxPerDay: line.max_per_day ?? 1,
        weekStart,
      }));
    }
    case "explicit_dates": {
      return allocations
        .filter(
          (a) => a.period_kind === "day" && a.quantity > 0 && withinLine(line, a.period_start),
        )
        .sort((a, b) =>
          a.period_start < b.period_start ? -1 : a.period_start > b.period_start ? 1 : 0,
        )
        .map((a) => ({
          kind: "day" as const,
          periodStart: a.period_start,
          periodEnd: a.period_start,
          eligibleDates: [a.period_start],
          quantity: a.quantity,
          maxPerDay: a.quantity,
          partialWeek: false,
        }));
    }
    case "week_grid": {
      const byWeek = new Map(
        allocations
          .filter((a) => a.period_kind === "week")
          .map((a) => [a.period_start, a.quantity]),
      );
      const weeks = [...byWeek.keys()].sort();
      if (weeks.length === 0) return [];
      const lastWeekEnd = addDays(weeks[weeks.length - 1]!, 6);
      return expandWeeks(
        line,
        weeks[0]!,
        end == null ? lastWeekEnd : end < lastWeekEnd ? end : lastWeekEnd,
        (weekStart) => {
          const quantity = byWeek.get(weekStart);
          if (quantity == null || quantity <= 0) return null;
          return { quantity, maxPerDay: line.max_per_day ?? 1, weekStart };
        },
      );
    }
  }
}

function expandWeeks(
  line: ScheduleRuleLike,
  firstWeekStart: string,
  end: string,
  rule: (weekStart: string) => { quantity: number; maxPerDay: number; weekStart: string } | null,
): DemandPeriod[] {
  const days = new Set(line.days_of_week);
  const periods: DemandPeriod[] = [];
  for (let weekStart = firstWeekStart; weekStart <= end; weekStart = addDays(weekStart, 7)) {
    const week = rule(weekStart);
    if (!week) continue;
    const weekEnd = addDays(weekStart, 6);
    const eligibleDates: string[] = [];
    for (const date of eachDate(weekStart, weekEnd)) {
      if (days.has(dayOfWeek(date)) && withinLine(line, date)) eligibleDates.push(date);
    }
    if (eligibleDates.length === 0) continue;
    periods.push({
      kind: "week",
      periodStart: weekStart,
      periodEnd: weekEnd,
      eligibleDates,
      quantity: week.quantity,
      maxPerDay: week.maxPerDay,
      partialWeek:
        weekStart < line.start_date || (line.end_date != null && weekEnd > line.end_date),
    });
  }
  return periods;
}

/** Sum of every period's quantity — the line's expected total over its whole run. */
export function expectedTotal(periods: DemandPeriod[]): number {
  return periods.reduce((sum, period) => sum + period.quantity, 0);
}

/**
 * The period a single date belongs to under a line's rule, or null when the
 * date is not eligible — the TypeScript twin of uw_line_period_for_date().
 */
export function periodForDate(
  line: ScheduleRuleLike,
  allocations: AllocationLike[],
  dateISO: string,
): { periodStart: string; periodEnd: string; quantity: number; maxPerDay: number } | null {
  if (!withinLine(line, dateISO)) return null;
  const dow = dayOfWeek(dateISO);
  const weekStart = weekStartOf(dateISO);
  switch (line.rule_kind) {
    case "fixed_days":
      if (!line.days_of_week.includes(dow) || line.count_per_day == null) return null;
      return {
        periodStart: dateISO,
        periodEnd: dateISO,
        quantity: line.count_per_day,
        maxPerDay: line.count_per_day,
      };
    case "weekly_quota":
      if (!line.days_of_week.includes(dow) || line.quantity_per_week == null) return null;
      return {
        periodStart: weekStart,
        periodEnd: addDays(weekStart, 6),
        quantity: line.quantity_per_week,
        maxPerDay: line.max_per_day ?? 1,
      };
    case "explicit_dates": {
      const allocation = allocations.find(
        (a) => a.period_kind === "day" && a.period_start === dateISO,
      );
      if (!allocation || allocation.quantity <= 0) return null;
      return {
        periodStart: dateISO,
        periodEnd: dateISO,
        quantity: allocation.quantity,
        maxPerDay: allocation.quantity,
      };
    }
    case "week_grid": {
      const allocation = allocations.find(
        (a) => a.period_kind === "week" && a.period_start === weekStart,
      );
      if (!allocation || allocation.quantity <= 0 || !line.days_of_week.includes(dow)) return null;
      return {
        periodStart: weekStart,
        periodEnd: addDays(weekStart, 6),
        quantity: allocation.quantity,
        maxPerDay: line.max_per_day ?? 1,
      };
    }
  }
}

// Per-period fulfillment -------------------------------------------------------

export type PlacementOutcome = "pending" | "aired" | "not_aired";

export interface PlacementForFulfillment {
  /** demand_period_start — the unit this placement consumes. */
  demandPeriodStart: string;
  placementDate: string;
  isMakegood: boolean;
  /** No broadcast event yet, aired as scheduled, or anything else (missed, skipped, …). */
  outcome: PlacementOutcome;
}

export interface MakegoodForFulfillment {
  demandPeriodStart: string | null;
  /** Scheduled with no slot chosen yet. */
  awaitingSlot: boolean;
}

export interface PeriodFulfillment extends DemandPeriod {
  /** Fresh (non-makegood) placements with no outcome yet. */
  scheduled: number;
  /** Fresh placements confirmed aired as scheduled. */
  aired: number;
  /** Fresh placements whose outcome was anything but aired as scheduled. */
  missed: number;
  makegoodsAwaitingSlot: number;
  makegoodsScheduled: number;
  makegoodsAired: number;
  /** Fresh units the period still needs: quantity minus every fresh placement, whatever its outcome (a missed one is replaced through its makegood, never re-sold as fresh demand). Matches log_place_underwriting_credit()'s quota check. */
  freshShortfall: number;
  /** Airings that actually count toward the order: aired fresh plus aired makegoods. */
  delivered: number;
}

export function computePeriodFulfillment(
  periods: DemandPeriod[],
  placements: PlacementForFulfillment[],
  makegoods: MakegoodForFulfillment[] = [],
): PeriodFulfillment[] {
  return periods.map((period) => {
    const own = placements.filter(
      (placement) => placement.demandPeriodStart === period.periodStart,
    );
    const fresh = own.filter((placement) => !placement.isMakegood);
    const mg = own.filter((placement) => placement.isMakegood);
    const scheduled = fresh.filter((p) => p.outcome === "pending").length;
    const aired = fresh.filter((p) => p.outcome === "aired").length;
    const missed = fresh.filter((p) => p.outcome === "not_aired").length;
    const makegoodsScheduled = mg.filter((p) => p.outcome === "pending").length;
    const makegoodsAired = mg.filter((p) => p.outcome === "aired").length;
    const makegoodsAwaitingSlot = makegoods.filter(
      (makegood) => makegood.awaitingSlot && makegood.demandPeriodStart === period.periodStart,
    ).length;
    return {
      ...period,
      scheduled,
      aired,
      missed,
      makegoodsAwaitingSlot,
      makegoodsScheduled,
      makegoodsAired,
      freshShortfall: Math.max(0, period.quantity - fresh.length),
      delivered: aired + makegoodsAired,
    };
  });
}

export type FulfillmentStatus = "no_target" | "on_track" | "behind" | "fulfilled";

export interface LineFulfillmentSummary {
  status: FulfillmentStatus;
  expected: number;
  delivered: number;
  scheduled: number;
  missed: number;
  freshShortfall: number;
  /** Periods that ended before todayISO with fewer deliveries than expected and nothing still scheduled to cover them. */
  periodsBehind: number;
}

/**
 * A line is fulfilled once every period is delivered in full with no
 * exception or makegood still open; behind when a period already in the
 * past is short or something is unresolved; on track otherwise.
 */
export function summarizeLineFulfillment(
  periods: PeriodFulfillment[],
  openItems: { openExceptions: number; openMakegoods: number },
  todayISO: string,
): LineFulfillmentSummary {
  const expected = expectedTotal(periods);
  const delivered = periods.reduce((sum, p) => sum + p.delivered, 0);
  const scheduled = periods.reduce((sum, p) => sum + p.scheduled + p.makegoodsScheduled, 0);
  const missed = periods.reduce((sum, p) => sum + p.missed, 0);
  const freshShortfall = periods.reduce((sum, p) => sum + p.freshShortfall, 0);
  const periodsBehind = periods.filter(
    (p) =>
      p.periodEnd < todayISO &&
      p.delivered + p.scheduled + p.makegoodsScheduled + p.makegoodsAwaitingSlot < p.quantity,
  ).length;
  const hasOpenItems = openItems.openExceptions > 0 || openItems.openMakegoods > 0;

  let status: FulfillmentStatus;
  if (periods.length === 0) status = "no_target";
  else if (delivered >= expected && !hasOpenItems) status = "fulfilled";
  else if (hasOpenItems || periodsBehind > 0) status = "behind";
  else status = "on_track";

  return { status, expected, delivered, scheduled, missed, freshShortfall, periodsBehind };
}

export const FULFILLMENT_STATUS_LABEL: Record<FulfillmentStatus, string> = {
  no_target: "No demand",
  on_track: "On track",
  behind: "Behind",
  fulfilled: "Fulfilled",
};

// Validation and description ---------------------------------------------------

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function describeDays(daysOfWeek: number[]): string {
  const sorted = [...new Set(daysOfWeek)].sort((a, b) => a - b);
  if (sorted.length === 7) return "any day";
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) return "each weekday";
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return "Saturday or Sunday";
  return sorted.map((d) => DAY_LABEL[d] ?? `day ${d}`).join("/");
}

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

/**
 * The order-entry preview: "2 AM Drive credits each weekday", "3 Total
 * Program Rotation credits a week, on any day, at most 1 a day", "1 Carpool
 * credit each Tue, targeting 8:19 AM".
 */
export function describeScheduleLine(
  line: ScheduleRuleLike & {
    target_time: string | null;
    window_start: string | null;
    window_end: string | null;
  },
  allocations: AllocationLike[],
  names: DescribeNames = {},
): string {
  const where = [names.poolName, names.programName].filter(Boolean).join(" on ") || "credit";
  const unit = (n: number) => `${n} ${where} credit${n === 1 ? "" : "s"}`;
  const window =
    line.window_start && line.window_end
      ? ` between ${formatTime(line.window_start)} and ${formatTime(line.window_end)}`
      : "";
  const target = line.target_time ? `, targeting ${formatTime(line.target_time)}` : "";
  const cancelled =
    line.status === "cancelled" && line.cancelled_from
      ? ` — cancelled from ${line.cancelled_from}`
      : "";

  switch (line.rule_kind) {
    case "fixed_days":
      return `${unit(line.count_per_day ?? 0)} ${describeDays(line.days_of_week)}${window}${target}${cancelled}`;
    case "weekly_quota":
      return `${unit(line.quantity_per_week ?? 0)} a week, ${describeDays(line.days_of_week)}, at most ${line.max_per_day ?? 1} a day${window}${target}${cancelled}`;
    case "explicit_dates": {
      const dated = allocations.filter((a) => a.period_kind === "day" && a.quantity > 0);
      const total = dated.reduce((sum, a) => sum + a.quantity, 0);
      return `${unit(total)} on ${dated.length} listed date${dated.length === 1 ? "" : "s"}${window}${target}${cancelled}`;
    }
    case "week_grid": {
      const weeks = allocations.filter((a) => a.period_kind === "week");
      const total = weeks.reduce((sum, a) => sum + a.quantity, 0);
      return `${unit(total)} across ${weeks.length} listed week${weeks.length === 1 ? "" : "s"}, ${describeDays(line.days_of_week)}, at most ${line.max_per_day ?? 1} a day${window}${target}${cancelled}`;
    }
  }
}

export interface ReviewWarning {
  code:
    | "stated_total_mismatch"
    | "partial_week"
    | "start_day_not_eligible"
    | "outside_contract"
    | "allocation_outside_line"
    | "no_demand";
  message: string;
}

/**
 * Things a traffic staffer should look at before trusting a line — never
 * blocking, never silently resolved (brief §3G, §6). The 309 Punk case
 * ("Oct. 3–Oct 23 Friday", where Oct 3 is a Saturday) surfaces as
 * start_day_not_eligible with the first real date named.
 */
export function reviewScheduleLine(
  line: ScheduleRuleLike & { stated_total: number | null },
  allocations: AllocationLike[],
  periods: DemandPeriod[],
  contract: { effective_from: string; effective_to: string | null },
): ReviewWarning[] {
  const warnings: ReviewWarning[] = [];
  const expected = expectedTotal(periods);

  if (periods.length === 0) {
    warnings.push({
      code: "no_demand",
      message: "This line expands to no credits at all — check its dates, days, or allocations.",
    });
  }
  if (line.stated_total != null && line.stated_total !== expected) {
    warnings.push({
      code: "stated_total_mismatch",
      message: `The order states ${line.stated_total} but the schedule as entered comes to ${expected}.`,
    });
  }
  const partial = periods.filter((p) => p.partialWeek);
  if (partial.length > 0) {
    warnings.push({
      code: "partial_week",
      message: `${partial.length} week${partial.length === 1 ? " is" : "s are"} only partly inside the line's dates (${partial.map((p) => p.periodStart).join(", ")}) — counted at the full weekly quantity, not prorated.`,
    });
  }
  // Only a fixed-days line makes a claim about its start date; a weekly
  // quota that starts on a Monday and airs weekends is the normal case.
  if (
    line.rule_kind === "fixed_days" &&
    line.days_of_week.length > 0 &&
    !line.days_of_week.includes(dayOfWeek(line.start_date))
  ) {
    const first = periods[0]?.eligibleDates[0];
    warnings.push({
      code: "start_day_not_eligible",
      message: `The line starts on a ${DAY_LABEL[dayOfWeek(line.start_date)]} (${line.start_date}) but airs ${describeDays(line.days_of_week)}${first ? ` — the first credit falls on ${first}` : ""}.`,
    });
  }
  const lineEnd = line.end_date ?? periods[periods.length - 1]?.periodEnd ?? null;
  if (
    line.start_date < contract.effective_from ||
    (contract.effective_to != null && lineEnd != null && lineEnd > contract.effective_to)
  ) {
    warnings.push({
      code: "outside_contract",
      message: `The line's dates (${line.start_date}${lineEnd ? ` – ${lineEnd}` : ""}) run outside the contract's (${contract.effective_from}${contract.effective_to ? ` – ${contract.effective_to}` : ""}).`,
    });
  }
  const stray = allocations.filter(
    (a) =>
      a.quantity > 0 &&
      !withinLine(line, a.period_kind === "week" ? addDays(a.period_start, 6) : a.period_start) &&
      !withinLine(line, a.period_start),
  );
  if (stray.length > 0) {
    warnings.push({
      code: "allocation_outside_line",
      message: `${stray.length} listed date${stray.length === 1 ? "" : "s"} fall outside the line's own start/end (${stray.map((a) => a.period_start).join(", ")}).`,
    });
  }
  return warnings;
}
