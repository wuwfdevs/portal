// Pure parsing/validation for the order-entry form (docs/underwriting-
// traffic-redesign.md §9) — turns what a traffic staffer typed from a
// signed insertion order into a schedule-line insert (eligibility) plus the
// compiled demand buckets, or a plain-language error. No Supabase import,
// colocated test.

import type { UwScheduleEntryKind, UwServiceLevel, UwTimeMode } from "@/lib/database.types";
import { isValidDateISO, weekStartOf } from "./dates";
import { compileDemandBuckets, type CompiledBucket, type EntrySpec } from "./demand-compiler";

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
  required_opportunity_key: string;
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
  /** explicit_dates: one date per line, optionally "x N"; week_grid: "YYYY-MM-DD N" per line, or a first Monday plus "grid_quantities". */
  dates_text: string;
  grid_first_monday: string;
  grid_quantities: string;
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
    required_opportunity_key: string | null;
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

export type ParseResult = { ok: true; value: ParsedScheduleLine } | { ok: false; error: string };

const ENTRY_KINDS: UwScheduleEntryKind[] = [
  "fixed_days",
  "weekly_quota",
  "monthly_quota",
  "every_n_weeks",
  "explicit_dates",
  "week_grid",
  "range_total",
];
const TIME_MODES: UwTimeMode[] = ["any", "window", "preferred", "exact", "slot"];
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

/** "2026-09-11", "2026-09-11 x2", "2026-09-11 x 2", "2026-09-11, 2026-09-24" → one entry per date. */
export function parseExplicitDates(
  text: string,
): { ok: true; value: { date: string; quantity: number }[] } | { ok: false; error: string } {
  const entries = text
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (entries.length === 0) return { ok: false, error: "List at least one date." };
  const byDate = new Map<string, number>();
  for (const entry of entries) {
    const match = /^(\d{4}-\d{2}-\d{2})(?:\s*[x×]\s*(\d+))?$/i.exec(entry);
    if (!match || !isValidDateISO(match[1]!))
      return { ok: false, error: `"${entry}" isn't a date (use YYYY-MM-DD, optionally "x 2").` };
    const quantity = match[2] ? Number.parseInt(match[2], 10) : 1;
    if (quantity < 1) return { ok: false, error: `"${entry}" asks for zero credits.` };
    byDate.set(match[1]!, (byDate.get(match[1]!) ?? 0) + quantity);
  }
  return {
    ok: true,
    value: [...byDate.entries()].sort().map(([date, quantity]) => ({ date, quantity })),
  };
}

/**
 * Either "YYYY-MM-DD N" per line (any date in the week; snapped to its
 * Monday), or a first Monday plus a comma/space-separated run of
 * quantities, one per week, zeros included — the way an agency grid reads.
 */
export function parseWeekGrid(
  text: string,
  firstMonday: string,
  quantities: string,
): { ok: true; value: { week_start: string; quantity: number }[] } | { ok: false; error: string } {
  const byWeek = new Map<string, number>();
  const lines = text
    .split(/\n+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  for (const entry of lines) {
    const match = /^(\d{4}-\d{2}-\d{2})[\s:,]+(\d+)$/.exec(entry);
    if (!match || !isValidDateISO(match[1]!))
      return {
        ok: false,
        error: `"${entry}" should read like "2026-01-26 6" (a date in the week, then the quantity).`,
      };
    byWeek.set(weekStartOf(match[1]!), Number.parseInt(match[2]!, 10));
  }
  const run = quantities
    .split(/[\s,;]+/)
    .map((q) => q.trim())
    .filter((q) => q !== "");
  if (run.length > 0) {
    if (!isValidDateISO(firstMonday))
      return { ok: false, error: "Give the Monday the grid's first column starts on." };
    let weekStart = weekStartOf(firstMonday);
    for (const q of run) {
      if (!/^\d+$/.test(q)) return { ok: false, error: `"${q}" isn't a whole number of credits.` };
      byWeek.set(weekStart, Number.parseInt(q, 10));
      const next = new Date(`${weekStart}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 7);
      weekStart = next.toISOString().slice(0, 10);
    }
  }
  if (byWeek.size === 0)
    return {
      ok: false,
      error:
        "Enter the grid: one week per line, or a first Monday and the run of weekly quantities.",
    };
  return {
    ok: true,
    value: [...byWeek.entries()].sort().map(([week_start, quantity]) => ({ week_start, quantity })),
  };
}

const TRAFFIC_KEY_RE = /^[a-z0-9][a-z0-9._-]{1,79}$/;

export function parseScheduleLineForm(values: ScheduleLineFormValues): ParseResult {
  const entryKind = values.entry_kind as UwScheduleEntryKind;
  if (!ENTRY_KINDS.includes(entryKind))
    return { ok: false, error: "Choose how the order sells these credits." };

  const poolId = orNull(values.pool_id);
  const programId = orNull(values.program_id);
  if (!poolId && !programId)
    return { ok: false, error: "Choose an inventory pool, a program, or both." };

  const durationSeconds = intOrNull(values.duration_seconds);
  if (durationSeconds == null || durationSeconds <= 0)
    return { ok: false, error: "Give the credit a duration greater than zero." };

  const startDate = values.start_date.trim();
  if (!isValidDateISO(startDate)) return { ok: false, error: "Give the line a start date." };
  const endDate = orNull(values.end_date);
  if (endDate !== null && (!isValidDateISO(endDate) || endDate < startDate))
    return { ok: false, error: "The end date must be on or after the start date." };

  const timeMode = values.time_mode as UwTimeMode;
  if (!TIME_MODES.includes(timeMode)) return { ok: false, error: "Choose a time rule." };
  const windowStart = orNull(values.window_start);
  const windowEnd = orNull(values.window_end);
  const preferredTime = orNull(values.preferred_time);
  const requiredKey = orNull(values.required_opportunity_key);
  if (timeMode === "window") {
    if (windowStart === null || windowEnd === null)
      return { ok: false, error: "Give both ends of the time window." };
    if (windowEnd <= windowStart)
      return { ok: false, error: "The window must end after it starts." };
  }
  if ((timeMode === "preferred" || timeMode === "exact") && preferredTime === null)
    return {
      ok: false,
      error:
        timeMode === "exact" ? "Give the exact time the order states." : "Give the preferred time.",
    };
  if (timeMode === "slot") {
    if (requiredKey === null)
      return {
        ok: false,
        error: "Give the Log traffic key of the position (e.g. marketplace.opening).",
      };
    if (!TRAFFIC_KEY_RE.test(requiredKey))
      return {
        ok: false,
        error:
          "A traffic key is lowercase letters, digits, dots and dashes — as Log's clock screen shows it.",
      };
  }

  const serviceLevel = (orNull(values.service_level) ?? "guaranteed") as UwServiceLevel;
  if (!SERVICE_LEVELS.includes(serviceLevel))
    return { ok: false, error: "Choose guaranteed or bonus." };

  const days = [
    ...new Set(values.days_of_week.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
  ].sort((a, b) => a - b);
  const statedTotal = intOrNull(values.stated_total);
  if (statedTotal !== null && statedTotal < 0)
    return { ok: false, error: "The stated total can't be negative." };
  const maxPerDay = intOrNull(values.max_per_day);
  if (maxPerDay !== null && maxPerDay < 1)
    return { ok: false, error: "Most per day must be at least 1, or blank for no cap." };

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
      const parsed = parseExplicitDates(values.dates_text);
      if (!parsed.ok) return parsed;
      spec = { kind: "explicit_dates", dates: parsed.value };
      break;
    }
    case "week_grid": {
      const parsed = parseWeekGrid(
        values.dates_text,
        values.grid_first_monday,
        values.grid_quantities,
      );
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
      line: {
        label: values.label.trim(),
        entry_kind: entryKind,
        entry_spec: spec,
        days_of_week: days,
        pool_id: poolId,
        program_id: programId,
        time_mode: timeMode,
        window_start: timeMode === "window" ? windowStart : null,
        window_end: timeMode === "window" ? windowEnd : null,
        preferred_time: timeMode === "preferred" || timeMode === "exact" ? preferredTime : null,
        required_opportunity_key: timeMode === "slot" ? requiredKey : null,
        max_per_day: maxPerDay,
        service_level: serviceLevel,
        duration_seconds: durationSeconds,
        start_date: startDate,
        end_date: endDate,
        flight_id: orNull(values.flight_id),
        stated_total: statedTotal,
        source_text: orNull(values.source_text),
        makegood_policy_text: orNull(values.makegood_policy_text),
        notes: orNull(values.notes),
      },
      buckets,
    },
  };
}
