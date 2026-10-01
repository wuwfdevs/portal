// The contract page's "By date" view (Schedule tab): the current revision's
// placements filtered by outcome and grouped into broadcast weeks. Pure, so
// the counts and grouping are tested rather than eyeballed.

import { weekStartOf } from "./dates";

export type PlacementListFilter = "upcoming" | "aired" | "not_aired";

export const PLACEMENT_LIST_FILTERS: { value: PlacementListFilter; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "aired", label: "Aired" },
  { value: "not_aired", label: "Not aired" },
];

/** `?show=` as a filter: Upcoming for anything missing or unknown. */
export function parsePlacementListFilter(raw: string | undefined): PlacementListFilter {
  return raw === "aired" || raw === "not_aired" ? raw : "upcoming";
}

type Outcome = "pending" | "aired" | "not_aired";

function filterOf(outcome: Outcome): PlacementListFilter {
  return outcome === "pending" ? "upcoming" : outcome;
}

export function countPlacementsByFilter(
  items: { outcome: Outcome }[],
): Record<PlacementListFilter, number> {
  const counts: Record<PlacementListFilter, number> = { upcoming: 0, aired: 0, not_aired: 0 };
  for (const item of items) counts[filterOf(item.outcome)]++;
  return counts;
}

export function filterPlacements<T extends { outcome: Outcome }>(
  items: T[],
  filter: PlacementListFilter,
): T[] {
  return items.filter((item) => filterOf(item.outcome) === filter);
}

export interface PlacementWeek<T> {
  /** The Monday that starts the broadcast week (station calendar). */
  weekStart: string;
  items: T[];
}

/**
 * Consecutive runs of items in the same Monday-start week, in the order
 * given (the caller sorts by air time). `placement_date` is already the
 * station's calendar date, so no timezone math is needed here.
 */
export function groupPlacementsByWeek<T extends { placementDate: string }>(
  items: T[],
): PlacementWeek<T>[] {
  const weeks: PlacementWeek<T>[] = [];
  for (const item of items) {
    const weekStart = weekStartOf(item.placementDate);
    const last = weeks[weeks.length - 1];
    if (last && last.weekStart === weekStart) last.items.push(item);
    else weeks.push({ weekStart, items: [item] });
  }
  return weeks;
}
