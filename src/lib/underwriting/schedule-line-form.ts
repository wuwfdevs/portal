// Pure parsing/validation for the order-entry form (docs/underwriting-
// traffic-redesign.md §3G) — turns what a traffic staffer typed from a
// signed insertion order into a schedule-line insert plus its allocations,
// or a plain-language error. No Supabase import, colocated test.

import type { UwScheduleRuleKind } from "@/lib/database.types";
import { isValidDateISO, weekStartOf } from "./demand";

export interface ScheduleLineFormValues {
  label: string;
  rule_kind: string;
  days_of_week: number[];
  count_per_day: string;
  quantity_per_week: string;
  max_per_day: string;
  pool_id: string;
  program_id: string;
  window_start: string;
  window_end: string;
  target_time: string;
  duration_seconds: string;
  start_date: string;
  end_date: string;
  flight_id: string;
  is_bonus: boolean;
  stated_total: string;
  source_text: string;
  notes: string;
  /** explicit_dates: one date per line, optionally "x N"; week_grid: "YYYY-MM-DD N" per line, or a first Monday plus "grid_quantities". */
  allocations_text: string;
  grid_first_monday: string;
  grid_quantities: string;
}

export interface ParsedAllocation {
  period_kind: "day" | "week";
  period_start: string;
  quantity: number;
}

export interface ParsedScheduleLine {
  line: {
    label: string;
    rule_kind: UwScheduleRuleKind;
    days_of_week: number[];
    count_per_day: number | null;
    quantity_per_week: number | null;
    max_per_day: number | null;
    pool_id: string | null;
    program_id: string | null;
    window_start: string | null;
    window_end: string | null;
    target_time: string | null;
    duration_seconds: number;
    start_date: string;
    end_date: string | null;
    flight_id: string | null;
    is_bonus: boolean;
    stated_total: number | null;
    source_text: string | null;
    notes: string | null;
  };
  allocations: ParsedAllocation[];
}

export type ParseResult = { ok: true; value: ParsedScheduleLine } | { ok: false; error: string };

const RULE_KINDS: UwScheduleRuleKind[] = [
  "fixed_days",
  "weekly_quota",
  "explicit_dates",
  "week_grid",
];

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

/** "2026-09-11", "2026-09-11 x2", "2026-09-11 x 2", "2026-09-11, 2026-09-24" → one allocation per date. */
export function parseExplicitDates(
  text: string,
): { ok: true; value: ParsedAllocation[] } | { ok: false; error: string } {
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
    value: [...byDate.entries()]
      .sort()
      .map(([period_start, quantity]) => ({ period_kind: "day", period_start, quantity })),
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
): { ok: true; value: ParsedAllocation[] } | { ok: false; error: string } {
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
    value: [...byWeek.entries()]
      .sort()
      .map(([period_start, quantity]) => ({ period_kind: "week", period_start, quantity })),
  };
}

export function parseScheduleLineForm(values: ScheduleLineFormValues): ParseResult {
  const ruleKind = values.rule_kind as UwScheduleRuleKind;
  if (!RULE_KINDS.includes(ruleKind))
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

  const windowStart = orNull(values.window_start);
  const windowEnd = orNull(values.window_end);
  if ((windowStart === null) !== (windowEnd === null))
    return { ok: false, error: "Give both ends of the time window, or neither." };
  if (windowStart !== null && windowEnd !== null && windowEnd <= windowStart)
    return { ok: false, error: "The window must end after it starts." };

  const days = [
    ...new Set(values.days_of_week.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
  ].sort((a, b) => a - b);
  const statedTotal = intOrNull(values.stated_total);
  if (statedTotal !== null && statedTotal < 0)
    return { ok: false, error: "The stated total can't be negative." };

  let countPerDay: number | null = null;
  let quantityPerWeek: number | null = null;
  let maxPerDay: number | null = null;
  let allocations: ParsedAllocation[] = [];

  switch (ruleKind) {
    case "fixed_days": {
      if (days.length === 0)
        return { ok: false, error: "Choose the day(s) of the week the credit airs." };
      countPerDay = intOrNull(values.count_per_day) ?? 1;
      if (countPerDay < 1) return { ok: false, error: "Credits per day must be at least 1." };
      if (endDate === null)
        return {
          ok: false,
          error: "A fixed-days line needs an end date so its demand can be counted.",
        };
      break;
    }
    case "weekly_quota": {
      if (days.length === 0)
        return { ok: false, error: "Choose the day(s) of the week the credit may air on." };
      quantityPerWeek = intOrNull(values.quantity_per_week);
      if (quantityPerWeek == null || quantityPerWeek < 1)
        return { ok: false, error: "Credits per week must be at least 1." };
      maxPerDay = intOrNull(values.max_per_day) ?? 1;
      if (maxPerDay < 1) return { ok: false, error: "Most per day must be at least 1." };
      if (endDate === null)
        return {
          ok: false,
          error: "A weekly quota needs an end date so its demand can be counted.",
        };
      break;
    }
    case "explicit_dates": {
      const parsed = parseExplicitDates(values.allocations_text);
      if (!parsed.ok) return parsed;
      allocations = parsed.value;
      break;
    }
    case "week_grid": {
      if (days.length === 0)
        return { ok: false, error: "Choose the day(s) of the week the grid's credits may air on." };
      maxPerDay = intOrNull(values.max_per_day) ?? 1;
      if (maxPerDay < 1) return { ok: false, error: "Most per day must be at least 1." };
      const parsed = parseWeekGrid(
        values.allocations_text,
        values.grid_first_monday,
        values.grid_quantities,
      );
      if (!parsed.ok) return parsed;
      allocations = parsed.value;
      break;
    }
  }

  return {
    ok: true,
    value: {
      line: {
        label: values.label.trim(),
        rule_kind: ruleKind,
        days_of_week: ruleKind === "explicit_dates" ? [] : days,
        count_per_day: countPerDay,
        quantity_per_week: quantityPerWeek,
        max_per_day: maxPerDay,
        pool_id: poolId,
        program_id: programId,
        window_start: windowStart,
        window_end: windowEnd,
        target_time: orNull(values.target_time),
        duration_seconds: durationSeconds,
        start_date: startDate,
        end_date: endDate,
        flight_id: orNull(values.flight_id),
        is_bonus: values.is_bonus,
        stated_total: statedTotal,
        source_text: orNull(values.source_text),
        notes: orNull(values.notes),
      },
      allocations,
    },
  };
}
