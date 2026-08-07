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

/** The station's UTC offset, in minutes, at the given instant (e.g. -300 for CDT, -360 for CST). */
function stationOffsetMinutesAt(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STATION_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - instant.getTime()) / 60_000;
}

/**
 * Converts a station-local calendar date (YYYY-MM-DD) and time-of-day
 * (HH:MM:SS, e.g. a log_schedule.air_time) into the UTC instant it actually
 * refers to, accounting for whichever of Central's two offsets (CST/CDT)
 * applies on that date — a fixed UTC-6 or UTC-5 assumption would be wrong
 * roughly half the year. Used by rundown generation to turn a schedule
 * entry's local air time into a real timestamptz; nothing before this needed
 * to construct a new instant from wall-clock time, only format an existing
 * one. Accurate for any ordinary broadcast time; does not attempt to
 * disambiguate the one repeated/skipped hour on a DST transition night
 * itself, which doesn't occur during this station's programming day.
 */
export function stationLocalDateTimeToUTC(dateISO: string, timeHHMMSS: string): string {
  const naiveUtc = new Date(`${dateISO}T${timeHHMMSS}Z`);
  const offsetMinutes = stationOffsetMinutesAt(naiveUtc);
  return new Date(naiveUtc.getTime() - offsetMinutes * 60_000).toISOString();
}
