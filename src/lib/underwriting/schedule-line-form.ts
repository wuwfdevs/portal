// Pure parsing/validation for the order-entry form (docs/underwriting-
// traffic-redesign.md §9) — turns what a traffic staffer entered from a
// signed insertion order into a schedule-line insert (eligibility) plus the
// compiled demand buckets, or a plain-language error. No Supabase import,
// colocated test.
//
// Every entry is structured (2026-09-25, replacing two free-text formats):
// explicit dates arrive as one row per date, and a week grid as one
// quantity per Monday between the line's own dates — the editor lays the
// weeks out from the dates, so nothing can be counted into the wrong week
// or fall outside the line and be dropped. A field the chosen kind does not
// use must be blank, so a quantity typed under the wrong kind is refused
// rather than silently ignored.
//
// Two stages (2026-09-27). `compileScheduleLineDemand()` reads only what
// the count depends on — the kind, the dates, the days and quantities — so
// the editor can show "this compiles to 52" the moment those are in, before
// a pool or time rule is chosen. `parseScheduleLineForm()` runs that and
// then checks everything else the row needs (a pool or program, a duration,
// the time rule's own fields), collecting every problem rather than
// stopping at the first, so the editor can list what still stands between
// the entry and a save. The original fail-fast aside showed "0 credits" and
// "choose a pool or program" for the whole time a staffer typed dates and
// days, which read as the compile not running at all.

import type { UwScheduleEntryKind, UwServiceLevel, UwTimeMode } from "@/lib/database.types";
import { isValidDateISO, weekStartOf } from "./dates";
import {
  compileDemandBuckets,
  parseEntrySpec,
  type CompiledBucket,
  type EntrySpec,
} from "./demand-compiler";

export interface ScheduleLineFormValues {
  label: string;
  entry_kind: string;
  days_of_week: number[];
  /** fixed_days: credits on each listed day. */
  count_per_day: string;
  /** weekly_quota / monthly_quota / every_n_weeks / range_total: the quantity. */
  quantity: string;
  /** every_n_weeks. */
  interval_weeks: string;
  pool_id: string;
  program_id: string;
  time_mode: string;
  window_start: string;
  window_end: string;
  preferred_time: string;
  max_per_day: string;
  service_level: string;
  duration_seconds: string;
  start_date: string;
  end_date: string;
  flight_id: string;
  stated_total: string;
  source_text: string;
  makegood_policy_text: string;
  notes: string;
  /** explicit_dates: one row per date; a blank quantity means 1. */
  explicit_dates: { date: string; quantity: string }[];
  /** week_grid: one row per Monday week between the line's dates; a blank quantity is a dark week (0). */
  week_grid: { week_start: string; quantity: string }[];
}

export interface ParsedScheduleLine {
  line: {
    label: string;
    entry_kind: UwScheduleEntryKind;
    entry_spec: EntrySpec;
    days_of_week: number[];
    pool_id: string | null;
    program_id: string | null;
    time_mode: UwTimeMode;
    window_start: string | null;
    window_end: string | null;
    preferred_time: string | null;
    max_per_day: number | null;
    service_level: UwServiceLevel;
    duration_seconds: number;
    start_date: string;
    end_date: string | null;
    flight_id: string | null;
    stated_total: number | null;
    source_text: string | null;
    makegood_policy_text: string | null;
    notes: string | null;
  };
  buckets: CompiledBucket[];
}

/** The part of a line the count depends on — everything but eligibility. */
export interface CompiledDemand {
  entry_kind: UwScheduleEntryKind;
  entry_spec: EntrySpec;
  days_of_week: number[];
  start_date: string;
  end_date: string | null;
  buckets: CompiledBucket[];
}

export type DemandResult = { ok: true; value: CompiledDemand } | { ok: false; error: string };

/**
 * `error` is the first problem, in the form's own top-to-bottom order; `errors`
 * is every problem found, the demand's (if any) first.
 */
export type ParseResult =
  { ok: true; value: ParsedScheduleLine } | { ok: false; error: string; errors: string[] };

const ENTRY_KINDS: UwScheduleEntryKind[] = [
  "fixed_days",
  "weekly_quota",
  "monthly_quota",
  "every_n_weeks",
  "explicit_dates",
  "week_grid",
  "range_total",
];
const TIME_MODES: UwTimeMode[] = ["any", "window", "preferred", "exact", "opening", "closing"];
const SERVICE_LEVELS: UwServiceLevel[] = ["guaranteed", "bonus"];

function intOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) ? value : null;
}

function orNull(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** One row per date, each with a count (blank = 1); the same date twice is summed. */
export function parseExplicitDates(
  rows: { date: string; quantity: string }[],
): { ok: true; value: { date: string; quantity: number }[] } | { ok: false; error: string } {
  const entries = rows.filter((row) => row.date.trim() !== "" || row.quantity.trim() !== "");
  if (entries.length === 0) return { ok: false, error: "List at least one date." };
  const byDate = new Map<string, number>();
  for (const entry of entries) {
    const date = entry.date.trim();
    if (!isValidDateISO(date)) return { ok: false, error: "Every listed date needs a real date." };
    const quantity = entry.quantity.trim() === "" ? 1 : intOrNull(entry.quantity);
    if (quantity == null || quantity < 1)
      return { ok: false, error: `${date} needs a whole number of credits, at least 1.` };
    byDate.set(date, (byDate.get(date) ?? 0) + quantity);
  }
  return {
    ok: true,
    value: [...byDate.entries()].sort().map(([date, quantity]) => ({ date, quantity })),
  };
}

/**
 * One quantity per Monday week between the line's dates (blank = a dark
 * week, 0), the way an agency grid prints. A week outside the line's own
 * dates is refused rather than dropped: the editor lays the weeks out from
 * the dates, so one can only get here by mistake.
 */
export function parseWeekGrid(
  rows: { week_start: string; quantity: string }[],
  startDate: string,
  endDate: string,
): { ok: true; value: { week_start: string; quantity: number }[] } | { ok: false; error: string } {
  if (rows.length === 0) return { ok: false, error: "Enter the grid: a quantity for each week." };
  const firstWeek = weekStartOf(startDate);
  const lastWeek = weekStartOf(endDate);
  const byWeek = new Map<string, number>();
  for (const row of rows) {
    const weekStart = row.week_start.trim();
    if (!isValidDateISO(weekStart) || weekStartOf(weekStart) !== weekStart)
      return { ok: false, error: "Every grid week must be keyed by its Monday." };
    if (weekStart < firstWeek || weekStart > lastWeek)
      return {
        ok: false,
        error: `The week of ${weekStart} is outside the line's dates — change the dates or leave it out.`,
      };
    const quantity = row.quantity.trim() === "" ? 0 : intOrNull(row.quantity);
    if (quantity == null || quantity < 0)
      return { ok: false, error: `The week of ${weekStart} needs a whole number of credits.` };
    byWeek.set(weekStart, quantity);
  }
  return {
    ok: true,
    value: [...byWeek.entries()].sort().map(([week_start, quantity]) => ({ week_start, quantity })),
  };
}

const KIND_LABEL: Record<UwScheduleEntryKind, string> = {
  fixed_days: "fixed-days",
  weekly_quota: "weekly-quota",
  monthly_quota: "monthly-quota",
  every_n_weeks: "every-N-weeks",
  explicit_dates: "explicit-dates",
  week_grid: "week-grid",
  range_total: "range-total",
};

/** A field the chosen kind never reads must be blank — a value typed under the wrong kind is refused, not ignored. */
function unusedFieldError(
  values: ScheduleLineFormValues,
  kind: UwScheduleEntryKind,
): string | null {
  const usesCountPerDay = kind === "fixed_days";
  const usesQuantity =
    kind === "weekly_quota" ||
    kind === "monthly_quota" ||
    kind === "every_n_weeks" ||
    kind === "range_total";
  const usesInterval = kind === "every_n_weeks";
  const label = KIND_LABEL[kind];
  if (!usesCountPerDay && values.count_per_day.trim() !== "")
    return `Credits per day isn't used by a ${label} line — clear it or change how the order sells it.`;
  if (!usesQuantity && values.quantity.trim() !== "")
    return `Quantity isn't used by a ${label} line — clear it or change how the order sells it.`;
  if (!usesInterval && values.interval_weeks.trim() !== "")
    return `The interval isn't used by a ${label} line — clear it or change how the order sells it.`;
  return null;
}

/**
 * The count alone: kind, dates, days, and quantities compiled to demand
 * buckets. Fails fast, since each step needs the one before it (no dates, no
 * weeks to lay out). Knows nothing about pools, programs, or time rules.
 */
export function compileScheduleLineDemand(values: ScheduleLineFormValues): DemandResult {
  const entryKind = values.entry_kind as UwScheduleEntryKind;
  if (!ENTRY_KINDS.includes(entryKind))
    return { ok: false, error: "Choose how the order sells these credits." };
  const unused = unusedFieldError(values, entryKind);
  if (unused) return { ok: false, error: unused };

  const startDate = values.start_date.trim();
  if (!isValidDateISO(startDate)) return { ok: false, error: "Give the line a start date." };
  const endDate = orNull(values.end_date);
  if (endDate !== null && (!isValidDateISO(endDate) || endDate < startDate))
    return { ok: false, error: "The end date must be on or after the start date." };

  const days = [
    ...new Set(values.days_of_week.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
  ].sort((a, b) => a - b);

  let spec: EntrySpec;
  switch (entryKind) {
    case "fixed_days": {
      if (days.length === 0)
        return { ok: false, error: "Choose the day(s) of the week the credit airs." };
      const countPerDay = intOrNull(values.count_per_day) ?? 1;
      if (countPerDay < 1) return { ok: false, error: "Credits per day must be at least 1." };
      if (endDate === null)
        return {
          ok: false,
          error: "A fixed-days line needs an end date so its demand can be counted.",
        };
      spec = { kind: "fixed_days", count_per_day: countPerDay };
      break;
    }
    case "weekly_quota":
    case "monthly_quota":
    case "range_total": {
      const quantity = intOrNull(values.quantity);
      if (quantity == null || quantity < 1)
        return { ok: false, error: "Give the number of credits the order calls for." };
      if (endDate === null)
        return { ok: false, error: "This line needs an end date so its demand can be counted." };
      spec = { kind: entryKind, quantity };
      break;
    }
    case "every_n_weeks": {
      const quantity = intOrNull(values.quantity);
      const interval = intOrNull(values.interval_weeks);
      if (quantity == null || quantity < 1)
        return { ok: false, error: "Give the number of credits per cycle." };
      if (interval == null || interval < 2)
        return { ok: false, error: "Give the interval in weeks (2 for every other week)." };
      if (endDate === null)
        return { ok: false, error: "This line needs an end date so its demand can be counted." };
      spec = { kind: "every_n_weeks", interval_weeks: interval, quantity };
      break;
    }
    case "explicit_dates": {
      const parsed = parseExplicitDates(values.explicit_dates);
      if (!parsed.ok) return parsed;
      const stray = parsed.value.filter(
        (entry) => entry.date < startDate || (endDate !== null && entry.date > endDate),
      );
      if (stray.length > 0)
        return {
          ok: false,
          error: `${stray[0]!.date} is outside the line's dates — change the dates or leave it out.`,
        };
      spec = { kind: "explicit_dates", dates: parsed.value };
      break;
    }
    case "week_grid": {
      if (endDate === null)
        return { ok: false, error: "A week grid needs an end date so its weeks can be laid out." };
      const parsed = parseWeekGrid(values.week_grid, startDate, endDate);
      if (!parsed.ok) return parsed;
      spec = { kind: "week_grid", weeks: parsed.value };
      break;
    }
  }

  const compileInput = { start_date: startDate, end_date: endDate, days_of_week: days };
  const buckets = compileDemandBuckets(spec, compileInput);
  if (buckets.length === 0)
    return {
      ok: false,
      error: "The schedule as entered compiles to no credits — check its dates and days.",
    };

  return {
    ok: true,
    value: {
      entry_kind: entryKind,
      entry_spec: spec,
      days_of_week: days,
      start_date: startDate,
      end_date: endDate,
      buckets,
    },
  };
}

export function parseScheduleLineForm(values: ScheduleLineFormValues): ParseResult {
  const demand = compileScheduleLineDemand(values);
  const problems: string[] = [];

  const poolId = orNull(values.pool_id);
  const programId = orNull(values.program_id);
  if (!poolId && !programId)
    problems.push("Choose an inventory pool, a program, or both — a line can't be station-wide.");

  const rawDuration = intOrNull(values.duration_seconds);
  const durationSeconds = rawDuration != null && rawDuration > 0 ? rawDuration : null;
  if (durationSeconds === null) problems.push("Give the credit a duration greater than zero.");

  const timeMode = values.time_mode as UwTimeMode;
  const windowStart = orNull(values.window_start);
  const windowEnd = orNull(values.window_end);
  const preferredTime = orNull(values.preferred_time);
  if (!TIME_MODES.includes(timeMode)) problems.push("Choose a time rule.");
  if (timeMode === "window") {
    if (windowStart === null || windowEnd === null)
      problems.push("Give both ends of the time window.");
    else if (windowEnd <= windowStart) problems.push("The window must end after it starts.");
  }
  if ((timeMode === "preferred" || timeMode === "exact") && preferredTime === null)
    problems.push(
      timeMode === "exact" ? "Give the exact time the order states." : "Give the preferred time.",
    );
  if ((timeMode === "opening" || timeMode === "closing") && programId === null)
    problems.push("An opening or closing credit needs the program it opens or closes.");

  const serviceLevel = (orNull(values.service_level) ?? "guaranteed") as UwServiceLevel;
  if (!SERVICE_LEVELS.includes(serviceLevel)) problems.push("Choose guaranteed or bonus.");

  const statedTotal = intOrNull(values.stated_total);
  if (statedTotal !== null && statedTotal < 0) problems.push("The stated total can't be negative.");
  const maxPerDay = intOrNull(values.max_per_day);
  if (maxPerDay !== null && maxPerDay < 1)
    problems.push("Most per day must be at least 1, or blank for no cap.");

  const errors = demand.ok ? problems : [demand.error, ...problems];
  if (!demand.ok || durationSeconds === null || errors.length > 0)
    return { ok: false, error: errors[0]!, errors };

  return {
    ok: true,
    value: {
      line: {
        label: values.label.trim(),
        entry_kind: demand.value.entry_kind,
        entry_spec: demand.value.entry_spec,
        days_of_week: demand.value.days_of_week,
        pool_id: poolId,
        program_id: programId,
        time_mode: timeMode,
        window_start: timeMode === "window" ? windowStart : null,
        window_end: timeMode === "window" ? windowEnd : null,
        preferred_time: timeMode === "preferred" || timeMode === "exact" ? preferredTime : null,
        max_per_day: maxPerDay,
        service_level: serviceLevel,
        duration_seconds: durationSeconds,
        start_date: demand.value.start_date,
        end_date: demand.value.end_date,
        flight_id: orNull(values.flight_id),
        stated_total: statedTotal,
        source_text: orNull(values.source_text),
        makegood_policy_text: orNull(values.makegood_policy_text),
        notes: orNull(values.notes),
      },
      buckets: demand.value.buckets,
    },
  };
}

/** The stored line fields the editor prefills from — a subset of the uw_contract_schedule_lines row. */
export interface StoredScheduleLine {
  label: string;
  entry_kind: UwScheduleEntryKind;
  entry_spec: unknown;
  days_of_week: number[];
  pool_id: string | null;
  program_id: string | null;
  time_mode: UwTimeMode;
  window_start: string | null;
  window_end: string | null;
  preferred_time: string | null;
  max_per_day: number | null;
  service_level: UwServiceLevel;
  duration_seconds: number;
  start_date: string;
  end_date: string | null;
  flight_id: string | null;
  stated_total: number | null;
  source_text: string | null;
  makegood_policy_text: string | null;
  notes: string | null;
}

/** Postgres returns a `time` as HH:MM:SS; the editor's <input type="time"> wants HH:MM. */
function timeInputValue(raw: string | null): string {
  return raw === null ? "" : raw.slice(0, 5);
}

/**
 * The inverse of parseScheduleLineForm() for the editor's prefill: a stored
 * line back into the form's own values, so editing (2026-09-27) reuses the
 * create form unchanged. An entry_spec that no longer parses (it never
 * should — the compiler wrote it) prefills the kind alone.
 */
export function formValuesFromScheduleLine(line: StoredScheduleLine): ScheduleLineFormValues {
  const spec = parseEntrySpec(line.entry_spec);
  const values: ScheduleLineFormValues = {
    label: line.label,
    entry_kind: line.entry_kind,
    days_of_week: [...line.days_of_week],
    count_per_day: "",
    quantity: "",
    interval_weeks: "",
    pool_id: line.pool_id ?? "",
    program_id: line.program_id ?? "",
    time_mode: line.time_mode,
    window_start: timeInputValue(line.window_start),
    window_end: timeInputValue(line.window_end),
    preferred_time: timeInputValue(line.preferred_time),
    max_per_day: line.max_per_day === null ? "" : String(line.max_per_day),
    service_level: line.service_level,
    duration_seconds: String(line.duration_seconds),
    start_date: line.start_date,
    end_date: line.end_date ?? "",
    flight_id: line.flight_id ?? "",
    stated_total: line.stated_total === null ? "" : String(line.stated_total),
    source_text: line.source_text ?? "",
    makegood_policy_text: line.makegood_policy_text ?? "",
    notes: line.notes ?? "",
    explicit_dates: [],
    week_grid: [],
  };
  if (!spec) return values;
  switch (spec.kind) {
    case "fixed_days":
      values.count_per_day = String(spec.count_per_day);
      break;
    case "weekly_quota":
    case "monthly_quota":
    case "range_total":
      values.quantity = String(spec.quantity);
      break;
    case "every_n_weeks":
      values.quantity = String(spec.quantity);
      values.interval_weeks = String(spec.interval_weeks);
      break;
    case "explicit_dates":
      values.explicit_dates = spec.dates.map((entry) => ({
        date: entry.date,
        quantity: String(entry.quantity),
      }));
      break;
    case "week_grid":
      values.week_grid = spec.weeks.map((week) => ({
        week_start: week.week_start,
        quantity: String(week.quantity),
      }));
      break;
  }
  return values;
}
