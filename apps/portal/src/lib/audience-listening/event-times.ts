// An event's start and end are the station's wall-clock times in a place, typed into `datetime-local` inputs. The server runs in UTC,
// so reading the typed value with `new Date()` would shift every event by the server's offset. These convert through the station's
// zone (lib/station-time.ts), the way the rundown's air times do.

import { STATION_TIME_ZONE, stationLocalDateTimeToUTC } from "@/lib/station-time";

const INPUT_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

/** "2026-12-05T18:00" typed in the station's zone to the UTC instant it names, or null if it is not a date and time. */
export function stationInputToUTC(value: string): string | null {
  const match = INPUT_RE.exec(value.trim());
  if (!match) return null;
  const iso = stationLocalDateTimeToUTC(match[1]!, `${match[2]}:00`);
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

/** A UTC instant as the `datetime-local` value the station's clock reads at that moment ("2026-12-05T18:00"), or "" if unreadable. */
export function utcToStationInput(iso: string | null | undefined): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STATION_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * The website's origin for a table link, from the station's website address: https (http only for localhost), no credentials, path, query or
 * fragment. A table link opens on the website, and a card is printed and handed to strangers, so a mistyped or hostile value must
 * not be able to point it elsewhere. Returns the origin, or the reason it cannot be used.
 */
export function readSiteOrigin(raw: string | undefined): { ok: true; origin: string } | { ok: false; problem: string } {
  const value = raw?.trim();
  if (!value) return { ok: false, problem: "The website address is not set, so a link has nowhere to point. An administrator sets it at Administration > Station." };
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, problem: "The website address is not a valid address." };
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    return { ok: false, problem: "The website address must be https (http is allowed only for localhost)." };
  }
  if (url.username || url.password) return { ok: false, problem: "The website address must not contain credentials." };
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    return { ok: false, problem: "The website address must be an origin only, with no path, query or fragment." };
  }
  return { ok: true, origin: url.origin };
}

/** "Fri, Dec 5, 6:00 PM CST": an event's moment as the room's clock reads it, with the zone spelled out. */
export function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: STATION_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
