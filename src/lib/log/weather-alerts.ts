// Pure handling of NWS watches, warnings and statements for the weather
// surfaces. No "server-only": plain data transformation, safe to unit test and
// to import from the client panel. The fetch itself lives in
// providers/weather.ts; this module parses NWS's /alerts/active GeoJSON into a
// small stored shape (log_weather_reading.alerts), ranks it, and words each
// alert's timing.

import { STATION_TIME_ZONE } from "./timezone";

/** What a host needs to tell apart at a glance — the Badge variant it renders as is danger / warning / neutral. */
export type AlertTier = "warning" | "watch" | "statement";

export interface WeatherAlert {
  /** NWS's own alert id (a urn), stable across updates of the same alert. */
  id: string;
  /** NWS's event name, e.g. "Hurricane Warning". */
  event: string;
  tier: AlertTier;
  /** NWS severity: Extreme, Severe, Moderate, Minor or Unknown. */
  severity: string;
  headline: string | null;
  description: string | null;
  instruction: string | null;
  areaDesc: string | null;
  senderName: string | null;
  /** When NWS sent this message. */
  issuedAt: string | null;
  /** The hard end, when NWS sets one. A hurricane warning usually has none. */
  endsAt: string | null;
}

const SEVERITY_RANK: Record<string, number> = {
  Extreme: 0,
  Severe: 1,
  Moderate: 2,
  Minor: 3,
  Unknown: 4,
};
const TIER_RANK: Record<AlertTier, number> = { warning: 0, watch: 1, statement: 2 };

/** Warning and Watch come from the event name; Extreme severity is treated as a warning whatever it is called. Everything else (advisories, statements, outlooks) is the quiet tier. */
export function classifyAlertTier(event: string, severity: string | null | undefined): AlertTier {
  if (/warning$/i.test(event.trim())) return "warning";
  if (severity === "Extreme") return "warning";
  if (/watch$/i.test(event.trim())) return "watch";
  return "statement";
}

interface NwsAlertFeature {
  properties?: {
    id?: string;
    event?: string;
    severity?: string;
    headline?: string | null;
    description?: string | null;
    instruction?: string | null;
    areaDesc?: string | null;
    senderName?: string | null;
    sent?: string | null;
    effective?: string | null;
    ends?: string | null;
    messageType?: string;
    status?: string;
  };
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Reads NWS's /alerts/active response. Drops tests/exercises, cancellations, and anything without an event name. */
export function parseNwsAlerts(
  response: { features?: NwsAlertFeature[] } | null | undefined,
): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  for (const feature of response?.features ?? []) {
    const p = feature.properties;
    const event = textOrNull(p?.event);
    if (!p || !event) continue;
    if (p.status && p.status !== "Actual") continue;
    if (p.messageType === "Cancel") continue;
    const severity = p.severity ?? "Unknown";
    alerts.push({
      id: p.id ?? `${event}:${p.sent ?? ""}`,
      event,
      tier: classifyAlertTier(event, severity),
      severity,
      headline: textOrNull(p.headline),
      description: textOrNull(p.description),
      instruction: textOrNull(p.instruction),
      areaDesc: textOrNull(p.areaDesc),
      senderName: textOrNull(p.senderName),
      issuedAt: p.sent ?? p.effective ?? null,
      endsAt: p.ends ?? null,
    });
  }
  return sortAlerts(alerts);
}

/** Warnings first, then watches, then statements; within a tier the more severe and the more recently issued first. */
export function sortAlerts(alerts: WeatherAlert[]): WeatherAlert[] {
  return [...alerts].sort((a, b) => {
    if (a.tier !== b.tier) return TIER_RANK[a.tier] - TIER_RANK[b.tier];
    const severity = (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4);
    if (severity !== 0) return severity;
    return (b.issuedAt ?? "").localeCompare(a.issuedAt ?? "");
  });
}

/**
 * Drops an alert whose hard end has passed. Deliberately keys on `endsAt`
 * only, not NWS's `expires`: `expires` is when the *message* lapses (a
 * hurricane warning's is typically a few hours out and is reissued), so
 * hiding on it would blank a live warning whenever a refresh failed.
 * Cancelled alerts are handled by the next successful check, not here.
 */
export function activeAlerts(alerts: WeatherAlert[], nowISO: string): WeatherAlert[] {
  const now = new Date(nowISO).getTime();
  return alerts.filter((alert) => !alert.endsAt || new Date(alert.endsAt).getTime() > now);
}

/** "in effect" with no end, else "until Sat 1:00 PM" in station time. */
export function alertTiming(alert: WeatherAlert): string {
  if (!alert.endsAt) return "in effect";
  const when = new Date(alert.endsAt).toLocaleString("en-US", {
    timeZone: STATION_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  return `until ${when}`;
}

/** "issued 6:56 AM" in station time, or null when NWS gave no send time. */
export function alertIssuedLabel(alert: WeatherAlert): string | null {
  if (!alert.issuedAt) return null;
  const time = new Date(alert.issuedAt).toLocaleString("en-US", {
    timeZone: STATION_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return `issued ${time}`;
}

/**
 * The flat string older readings and the hazards column carry: event names in
 * rank order, no boilerplate. Null when there is nothing to show.
 */
export function alertsToHazards(alerts: WeatherAlert[]): string | null {
  return alerts.length === 0 ? null : alerts.map((alert) => alert.event).join("; ");
}

/** Reads the jsonb column back into alerts, tolerating a row that predates it. */
export function readStoredAlerts(value: unknown): WeatherAlert[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is WeatherAlert =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as WeatherAlert).event === "string" &&
      typeof (entry as WeatherAlert).tier === "string",
  );
}

export type AlertsCheckState =
  /** Checked and nothing is active — draw nothing. */
  | "none"
  /** Checked recently enough; show what is active. */
  | "current"
  /** The latest check failed but an earlier one is on file — show it, labelled with when. */
  | "stale"
  /** Never checked successfully — say so rather than implying all clear. */
  | "unknown";

/**
 * What the panel should do. `checkedAt` is the last *successful* check (null if
 * none ever succeeded); `latestCheckFailed` is true when the most recent
 * attempt errored.
 */
export function alertsCheckState(
  alerts: WeatherAlert[],
  checkedAt: string | null,
  latestCheckFailed: boolean,
): AlertsCheckState {
  if (checkedAt === null) return "unknown";
  if (latestCheckFailed) return "stale";
  return alerts.length === 0 ? "none" : "current";
}

/**
 * NWS wraps its text hard at ~70 columns and separates paragraphs with a
 * blank line. Join the wraps, keep the paragraphs, and drop the "* WHAT..."
 * bullet markers some products use, so a host reads sentences.
 */
export function normalizeNwsText(text: string): string {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .replace(/^\s*\*\s*/, "")
        .replace(/\s*\n\s*/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The words a host reads first: NWS's instruction when it has one (what to do
 * is the actionable part), else the opening paragraph of the description,
 * else the headline. The complete text stays one click away.
 */
export function alertLeadText(alert: WeatherAlert): string | null {
  if (alert.instruction) return normalizeNwsText(alert.instruction).split("\n\n")[0] ?? null;
  if (alert.description) return normalizeNwsText(alert.description).split("\n\n")[0] ?? null;
  return alert.headline;
}

/** Everything NWS said, normalized, for the "Full NWS text" disclosure. Null when it adds nothing beyond the lead. */
export function alertFullText(alert: WeatherAlert): string | null {
  const parts = [alert.description, alert.instruction]
    .filter((part): part is string => Boolean(part))
    .map(normalizeNwsText);
  if (parts.length === 0) return null;
  const full = parts.join("\n\n");
  return full === alertLeadText(alert) ? null : full;
}

export type AlertsDisplay =
  /** Draw nothing. */
  | "hidden"
  /** Draw the "couldn't verify" notice instead of a list. */
  | "unverified"
  /** Draw the panel; there is at least one alert. */
  | "list";

/**
 * What the panel draws. The check state alone is not enough: a failed check
 * after an all-clear leaves a "stale" state with an empty list, which must
 * still say it could not verify (an empty stale list is not "all clear"), and
 * which has no lead alert to name.
 */
export function alertsDisplay(alerts: WeatherAlert[], state: AlertsCheckState): AlertsDisplay {
  if (state === "unknown") return "unverified";
  if (alerts.length === 0) return state === "stale" ? "unverified" : "hidden";
  return "list";
}

// "Local Statement" is one product name (Hurricane/Tropical Cyclone Local
// Statement), so "Local" goes with it rather than being left dangling.
const LABEL_SUFFIX =
  /\s+((?:Local\s+)?(Warning|Watch|Advisory|Statement|Outlook|Message|Bulletin))$/i;

/**
 * The badge says what kind of alert it is, so the name shouldn't say it again:
 * "Hurricane Warning" reads Warning + "Hurricane", "Flood Watch" Watch +
 * "Flood". The badge word follows the event's own last word where there is one
 * (Advisory, Statement), so a Small Craft Advisory is not mislabelled as a
 * Statement. An event whose tier comes from severity alone keeps its full name.
 */
export function alertLabels(alert: Pick<WeatherAlert, "event" | "tier">): {
  badge: string;
  name: string;
} {
  const suffix = LABEL_SUFFIX.exec(alert.event.trim())?.[2];
  const word = suffix ? suffix[0]!.toUpperCase() + suffix.slice(1).toLowerCase() : null;
  const tierWord = alert.tier === "warning" ? "Warning" : alert.tier === "watch" ? "Watch" : null;
  const badge = tierWord ?? word ?? "Alert";
  // Strip the suffix only when it is exactly what the badge already says.
  if (word && word === badge) {
    const name = alert.event.trim().replace(LABEL_SUFFIX, "").trim();
    return { badge, name: name || alert.event.trim() };
  }
  return { badge, name: alert.event.trim() };
}

/**
 * NWS's areaDesc is a semicolon-separated list of counties and zones. For a
 * header a host scans: the first two, then how many more — "Escambia, Santa
 * Rosa +3". Null when NWS gave no area.
 */
export function abbreviateAreas(areaDesc: string | null | undefined, shown = 2): string | null {
  if (!areaDesc) return null;
  const areas = [
    ...new Set(
      areaDesc
        .split(";")
        .map((area) => area.trim())
        .filter(Boolean),
    ),
  ];
  if (areas.length === 0) return null;
  if (areas.length <= shown) return areas.join(", ");
  return `${areas.slice(0, shown).join(", ")} +${areas.length - shown}`;
}
