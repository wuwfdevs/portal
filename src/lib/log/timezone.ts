// Log operates one physical broadcast studio in Pensacola, FL — Escambia
// County observes Central time (America/Chicago), not Eastern, despite being
// in the Florida panhandle. Every wall-clock-facing display in this tool —
// "today"'s schedule, NPR/weather "last updated" — must be pinned to that
// timezone explicitly. Left unspecified, Date/Intl formatting falls back to
// the rendering process's own timezone, which server-side (Vercel) is UTC —
// five hours off Pensacola in August (CDT), silently showing the wrong hour
// and, for a bare calendar date, sometimes the wrong day. No Supabase
// import, colocated test, pure and safe to call from any Server Component.

export const STATION_TIME_ZONE = "America/Chicago";

/**
 * Today's calendar date (YYYY-MM-DD) in the station's own timezone, not the
 * server's. Matters most in the evening: from roughly 7pm to midnight
 * Central, the UTC date has already rolled to tomorrow, so a plain
 * `new Date().toISOString().slice(0, 10)` would show tomorrow's schedule on
 * the Today screen for that whole window.
 */
export function stationTodayISO(nowISO: string = new Date().toISOString()): string {
  return new Date(nowISO).toLocaleDateString("en-CA", { timeZone: STATION_TIME_ZONE });
}

/**
 * Formats a calendar date (YYYY-MM-DD) as a long station-local date
 * ("Friday, August 7"), e.g. for the Today screen's header. Anchored at
 * noon UTC so the conversion into Central time can never shift the
 * displayed calendar day, regardless of which date the caller passes.
 */
export function formatStationDateLong(dateISO: string): string {
  return new Date(`${dateISO}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: STATION_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * Formats an instant as a short station-local date + time, with an explicit
 * zone abbreviation so it never reads as ambiguous — e.g. for NPR/weather's
 * "last updated"/"retrieved" timestamps.
 */
export function formatStationTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: STATION_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
