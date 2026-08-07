// Pure staleness check shared by NPR and weather's lazy-refresh reads
// (lib/log/npr.ts, lib/log/weather.ts) — no Supabase import, colocated test.
// Both follow docs/log-design.md §6's "no job queue" architecture note:
// refresh happens inline at read time when the cached data is older than its
// own threshold, never on a schedule.

export const NPR_STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
export const WEATHER_STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export interface StalenessCheck {
  isStale: boolean;
  ageMs: number;
}

/**
 * Whether `lastUpdatedAtISO` is at least `thresholdMs` old as of `nowISO`.
 * Never having been fetched (`null`) is always stale.
 */
export function checkStaleness(
  lastUpdatedAtISO: string | null,
  thresholdMs: number,
  nowISO: string,
): StalenessCheck {
  if (!lastUpdatedAtISO) return { isStale: true, ageMs: Number.POSITIVE_INFINITY };
  const ageMs = new Date(nowISO).getTime() - new Date(lastUpdatedAtISO).getTime();
  return { isStale: ageMs >= thresholdMs, ageMs };
}
