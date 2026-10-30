// Constraint-ordered auto-fill (docs/underwriting-traffic-redesign.md §10).
// Pure: no Supabase import, colocated test. When more than one schedule
// line is filled in one run — a contract's lines, or every active line on
// the dashboard — the most-constrained lines go first, so a credit that can
// only ever sit in one break (an exact time, a program's opening or closing
// avail) claims it before a line that could take any avail in the daypart
// fills the same break by accident of list order. RadioTraffic carries a
// hand-set placement priority per line for this; here the constraint itself
// is the priority, and nothing about rate or contract length ranks a line —
// most WUWF spots are $0.

import type { UwServiceLevel, UwTimeMode } from "@/lib/database.types";
import { minutesFromTimeString } from "./eligibility";

export interface FillOrderLineLike {
  time_mode: UwTimeMode;
  window_start: string | null;
  window_end: string | null;
  service_level: UwServiceLevel;
}

/** 0 = exact/opening/closing, 1 = window, 2 = preferred, 3 = any. */
export type ConstraintTier = 0 | 1 | 2 | 3;

export function constraintTier(line: Pick<FillOrderLineLike, "time_mode">): ConstraintTier {
  switch (line.time_mode) {
    case "exact":
    case "opening":
    case "closing":
      return 0;
    case "window":
      return 1;
    case "preferred":
      return 2;
    case "any":
      return 3;
  }
}

/** A credit whose placement is fixed by the order — an exact time, or a program's opening or closing avail. Everything else can move within its eligibility. */
export function isFixedPosition(line: Pick<FillOrderLineLike, "time_mode">): boolean {
  return constraintTier(line) === 0;
}

/** A window line's width in minutes, or null for any other mode (or a malformed window). */
export function windowWidthMinutes(
  line: Pick<FillOrderLineLike, "time_mode" | "window_start" | "window_end">,
): number | null {
  if (line.time_mode !== "window" || line.window_start == null || line.window_end == null)
    return null;
  const width = minutesFromTimeString(line.window_end) - minutesFromTimeString(line.window_start);
  return width > 0 ? width : null;
}

/**
 * Orders lines most-constrained first: by tier; within the window tier the
 * narrower window first; guaranteed before bonus; then the line with fewer
 * candidate breaks (a null count sorts last); then the order given. Stable,
 * so two indistinguishable lines keep their relative order.
 */
export function orderLinesForFill<T extends FillOrderLineLike>(
  lines: T[],
  candidateCount: (line: T) => number | null = () => null,
): T[] {
  return lines
    .map((line, index) => ({
      line,
      index,
      tier: constraintTier(line),
      width: windowWidthMinutes(line) ?? Number.POSITIVE_INFINITY,
      bonus: line.service_level === "bonus" ? 1 : 0,
      candidates: candidateCount(line) ?? Number.POSITIVE_INFINITY,
    }))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.width - b.width ||
        a.bonus - b.bonus ||
        a.candidates - b.candidates ||
        a.index - b.index,
    )
    .map((entry) => entry.line);
}
