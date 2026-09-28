import { shortDate } from "./dates";
import type { BucketFulfillment, PlacementOutcome } from "./demand";
import { describeBucketPeriod } from "./demand";

/**
 * The contract page's per-line details table (docs/underwriting-traffic-
 * redesign.md §11.6): demand and placements as one table keyed by period,
 * rather than a "Demand by period" view and a "Placements" view that told
 * the same story from two ends. A filled period shows its placements; an
 * open one reads "nothing scheduled" with a Place action; a period whose
 * bucket was cancelled or superseded is shown struck through.
 */

export interface PeriodRowPlacementLike {
  id: string;
  demand_bucket_id: string;
  scheduled_at: string;
  status: string;
  makegood_id: string | null;
  override_reason: string | null;
  outcome: PlacementOutcome;
}

export interface PeriodRow<P extends PeriodRowPlacementLike = PeriodRowPlacementLike> {
  bucketId: string;
  /** "Week of Sep 28", "Sep 28", "Sep 28 – Oct 4". */
  label: string;
  periodStart: string;
  periodEnd: string;
  bucketStatus: BucketFulfillment["status"];
  quantity: number;
  /** Non-superseded placements consuming this bucket, in air order. */
  placements: P[];
  /** Fresh units still needed — a Place action per unit. */
  needed: number;
  makegoodsAwaitingSlot: number;
  /**
   * `settled`: every placement has an outcome and nothing is still needed.
   * `open`: something is still needed or still to air. `inactive`: the
   * bucket was cancelled or superseded.
   */
  kind: "settled" | "open" | "inactive";
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildPeriodRows<P extends PeriodRowPlacementLike>(
  buckets: BucketFulfillment[],
  placements: P[],
): PeriodRow<P>[] {
  const byBucket = new Map<string, P[]>();
  for (const placement of placements) {
    if (placement.status === "superseded") continue;
    const list = byBucket.get(placement.demand_bucket_id) ?? [];
    list.push(placement);
    byBucket.set(placement.demand_bucket_id, list);
  }
  return [...buckets]
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map((bucket) => {
      const own = (byBucket.get(bucket.bucketId) ?? []).sort((a, b) =>
        a.scheduled_at.localeCompare(b.scheduled_at),
      );
      const inactive = bucket.status !== "active";
      const needed = inactive ? 0 : bucket.freshShortfall;
      const pending = own.some((placement) => placement.outcome === "pending");
      return {
        bucketId: bucket.bucketId,
        label: capitalize(
          describeBucketPeriod({ period_start: bucket.periodStart, period_end: bucket.periodEnd }),
        ),
        periodStart: bucket.periodStart,
        periodEnd: bucket.periodEnd,
        bucketStatus: bucket.status,
        quantity: bucket.quantity,
        placements: own,
        needed,
        makegoodsAwaitingSlot: inactive ? 0 : bucket.makegoodsAwaitingSlot,
        kind: inactive
          ? "inactive"
          : needed === 0 && !pending && bucket.makegoodsAwaitingSlot === 0
            ? "settled"
            : "open",
      };
    });
}

export interface FoldedPeriodRows<P extends PeriodRowPlacementLike = PeriodRowPlacementLike> {
  /** A leading run of settled periods — folded behind "Show N earlier periods". */
  earlier: PeriodRow<P>[];
  /** Everything from the first unsettled period to the last period with any placement. */
  shown: PeriodRow<P>[];
  /** A trailing run of periods with nothing scheduled at all — folded behind "Show N more periods". */
  later: PeriodRow<P>[];
}

/**
 * Folds a long schedule (26 weeks, 52 weeks) so the table opens on what
 * matters: the first period still in play through the last one with a
 * placement, keeping at least `minShown` rows visible. Settled history
 * folds to one line at the top; untouched future demand folds to one line
 * at the bottom.
 */
export function foldPeriodRows<P extends PeriodRowPlacementLike>(
  rows: PeriodRow<P>[],
  minShown = 4,
): FoldedPeriodRows<P> {
  let first = rows.findIndex((row) => row.kind !== "settled");
  if (first === -1) first = Math.max(0, rows.length - minShown);
  let lastWithPlacement = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i]!.placements.length > 0 || rows[i]!.kind === "inactive") {
      lastWithPlacement = i;
      break;
    }
  }
  // Show through the last placement, and at least minShown rows, so
  // "what's next" is on screen.
  const end = Math.min(rows.length, Math.max(lastWithPlacement + 1, first + minShown));
  // Keep minShown rows visible even when that means pulling settled history in.
  while (end - first < minShown && first > 0) first--;
  return {
    earlier: rows.slice(0, first),
    shown: rows.slice(first, end),
    later: rows.slice(end),
  };
}

/** True when every folded period is settled — the fold line can say "all aired". */
export function allSettled(rows: PeriodRow[]): boolean {
  return rows.length > 0 && rows.every((row) => row.kind === "settled");
}

/** True when every folded period has nothing scheduled — the fold line can say "all still needed". */
export function allUntouched(rows: PeriodRow[]): boolean {
  return rows.length > 0 && rows.every((row) => row.placements.length === 0 && row.needed > 0);
}

/** "Jan 5 – Jul 5, 2026", "Dec 1, 2025 – Feb 28, 2026", or "from Jan 5, 2026, ongoing". */
export function formatDateRange(startISO: string, endISO: string | null): string {
  const startYear = startISO.slice(0, 4);
  if (endISO === null) return `from ${shortDate(startISO)}, ${startYear}, ongoing`;
  const endYear = endISO.slice(0, 4);
  if (startYear === endYear) return `${shortDate(startISO)} – ${shortDate(endISO)}, ${startYear}`;
  return `${shortDate(startISO)}, ${startYear} – ${shortDate(endISO)}, ${endYear}`;
}
