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
  /** CAP severity: Extreme, Severe, Moderate, Minor or Unknown. */
  severity: string;
  /** CAP urgency: Immediate, Expected, Future, Past or Unknown. */
  urgency: string;
  headline: string | null;
  description: string | null;
  instruction: string | null;
  areaDesc: string | null;
  /** Which of WUWF's coverage counties the alert covers, by name, in a fixed order. Empty when NWS gave no county codes (marine alerts, for one). */
  places: string[];
  senderName: string | null;
  /** When NWS sent this message. */
  issuedAt: string | null;
  /** When the hazard begins, when that is later than now — a Watch is often issued for tomorrow. */
  startsAt: string | null;
  /** The hard end, when NWS sets one. A hurricane warning usually has none. */
  endsAt: string | null;
  /** Ids of earlier alerts this message replaces (CAP "references"). */
  supersedes?: string[];
  /**
   * Set only on a consolidated row (see consolidateAlerts): the separate NWS
   * alerts it stands for, each keeping its own text, places and end time.
   */
  members?: WeatherAlert[];
}

const SEVERITY_RANK: Record<string, number> = {
  Extreme: 0,
  Severe: 1,
  Moderate: 2,
  Minor: 3,
  Unknown: 4,
};
const URGENCY_RANK: Record<string, number> = {
  Immediate: 0,
  Expected: 1,
  Future: 2,
  Past: 3,
  Unknown: 4,
};
const TIER_RANK: Record<AlertTier, number> = { warning: 0, watch: 1, statement: 2 };

/**
 * The counties WUWF covers, with their SAME (FIPS) codes — NWS tags every
 * alert with the counties it touches, which is a precise match where the
 * zone names are not ("Escambia" is also a county in Alabama; "Mobile Coastal"
 * and "Baldwin Coastal" are zones, not counties). Order is the display order.
 */
export const COVERAGE_COUNTIES: ReadonlyArray<{ name: string; same: string }> = [
  { name: "Escambia", same: "012033" },
  { name: "Santa Rosa", same: "012113" },
  { name: "Okaloosa", same: "012091" },
  { name: "Mobile", same: "001097" },
];

/** The coverage counties named in an alert's SAME codes, in display order. */
export function coveragePlaces(same: readonly string[] | null | undefined): string[] {
  const codes = new Set(same ?? []);
  return COVERAGE_COUNTIES.filter((county) => codes.has(county.same)).map((county) => county.name);
}

/**
 * Warning and Watch come from the event name. Emergencies and evacuations
 * are the most urgent products NWS relays but do not end in "Warning"
 * ("Civil Emergency Message", "Child Abduction Emergency", "911 Telephone
 * Outage Emergency", "Local Area Emergency", "Evacuation - Immediate"), so
 * they are named explicitly; Extreme severity is a warning whatever it is
 * called. Everything else (advisories, statements, outlooks, messages) is the
 * quiet tier.
 */
export function classifyAlertTier(event: string, severity: string | null | undefined): AlertTier {
  const name = event.trim();
  if (/warning$/i.test(name)) return "warning";
  if (/emergency( message)?$/i.test(name) || /^evacuation\b/i.test(name)) return "warning";
  // Not weather, but the public cannot call for help: a station relays it as a warning.
  if (/^911 telephone outage$/i.test(name)) return "warning";
  if (severity === "Extreme") return "warning";
  if (/watch$/i.test(name)) return "watch";
  return "statement";
}

interface NwsAlertFeature {
  properties?: {
    id?: string;
    event?: string;
    severity?: string;
    urgency?: string;
    headline?: string | null;
    description?: string | null;
    instruction?: string | null;
    areaDesc?: string | null;
    geocode?: { SAME?: string[] };
    senderName?: string | null;
    sent?: string | null;
    effective?: string | null;
    onset?: string | null;
    ends?: string | null;
    references?: Array<{ identifier?: string; "@id"?: string }>;
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
    // Cancel withdraws an alert; Ack and Error are system traffic, not hazards.
    if (p.messageType === "Cancel" || p.messageType === "Ack" || p.messageType === "Error")
      continue;
    // Products that are not hazards: a test, the routine short-term forecast,
    // and NWS-internal administrative traffic.
    if (/^(test|short term forecast|administrative message)$/i.test(event)) continue;
    // Only WUWF's coverage. NWS lists the counties an alert touches; one that
    // names counties and none of ours does not apply here and is dropped. An
    // alert with no county codes at all (some marine products) cannot be
    // judged and is kept, since NWS matched it to the studio's point.
    const same = p.geocode?.SAME ?? [];
    const places = coveragePlaces(same);
    if (same.length > 0 && places.length === 0) continue;
    const severity = p.severity ?? "Unknown";
    alerts.push({
      id: p.id ?? `${event}:${p.sent ?? ""}`,
      event,
      tier: classifyAlertTier(event, severity),
      severity,
      urgency: p.urgency ?? "Unknown",
      headline: textOrNull(p.headline),
      description: textOrNull(p.description),
      instruction: textOrNull(p.instruction),
      areaDesc: textOrNull(p.areaDesc),
      places,
      senderName: textOrNull(p.senderName),
      issuedAt: p.sent ?? p.effective ?? null,
      startsAt: p.onset ?? p.effective ?? null,
      supersedes: (p.references ?? [])
        .map((ref) => ref.identifier ?? ref["@id"]?.split("/").pop() ?? "")
        .filter(Boolean),
      endsAt: p.ends ?? null,
    });
  }
  return sortAlerts(removeSuperseded(alerts));
}

/** Drops every alert that a later message in the same set says it replaces. */
export function removeSuperseded(alerts: WeatherAlert[]): WeatherAlert[] {
  const replaced = new Set(alerts.flatMap((alert) => alert.supersedes ?? []));
  return replaced.size === 0 ? alerts : alerts.filter((alert) => !replaced.has(alert.id));
}

/** An ISO instant as milliseconds, 0 when absent. Instants carry differing offsets ("-05:00" vs "Z"), so they must be compared as times, not strings. */
function timeMs(iso: string | null | undefined): number {
  return iso ? new Date(iso).getTime() || 0 : 0;
}

/** Warnings first, then watches, then statements; within a tier the more severe and the more recently issued first. */
export function sortAlerts(alerts: WeatherAlert[]): WeatherAlert[] {
  return [...alerts].sort((a, b) => {
    if (a.tier !== b.tier) return TIER_RANK[a.tier] - TIER_RANK[b.tier];
    const severity = (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4);
    if (severity !== 0) return severity;
    const urgency = (URGENCY_RANK[a.urgency] ?? 4) - (URGENCY_RANK[b.urgency] ?? 4);
    if (urgency !== 0) return urgency;
    return timeMs(b.issuedAt) - timeMs(a.issuedAt);
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

function stationWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: STATION_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * "in effect" when already running with no end, "until Sat 1:00 PM" with one,
 * and for a hazard that has not begun yet (a Watch for tomorrow) "begins Fri
 * 6:00 PM" plus its end when it has one. Station time throughout.
 */
export function alertTiming(alert: WeatherAlert, nowISO: string): string {
  // A consolidated row whose members end at different times has no single end.
  if (membersEndAtDifferentTimes(alert)) return "times vary";
  const begins =
    alert.startsAt && new Date(alert.startsAt).getTime() > new Date(nowISO).getTime()
      ? `begins ${stationWhen(alert.startsAt)}`
      : null;
  const until = alert.endsAt ? `until ${stationWhen(alert.endsAt)}` : null;
  if (begins && until) return `${begins}, ${until}`;
  return begins ?? until ?? "in effect";
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

/** Reads the jsonb column back into alerts, tolerating a row that predates a field. */
export function readStoredAlerts(value: unknown): WeatherAlert[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is WeatherAlert =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as WeatherAlert).event === "string" &&
        typeof (entry as WeatherAlert).tier === "string",
    )
    .map((entry) => ({
      ...entry,
      urgency: entry.urgency ?? "Unknown",
      places: entry.places ?? [],
      supersedes: entry.supersedes ?? [],
      startsAt: entry.startsAt ?? null,
    }));
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
  const first = (text: string) => {
    const paragraphs = normalizeNwsText(text).split("\n\n");
    // Tropical products open with a list of places or a next-update time;
    // the places are already in the header, so lead with real prose.
    return paragraphs.find((paragraph) => !NOT_LEAD.test(paragraph)) ?? paragraphs[0] ?? null;
  };
  if (alert.instruction) return first(alert.instruction);
  if (alert.description) return first(alert.description);
  return alert.headline;
}

const NOT_LEAD = /^(locations affected|next update|\.\.\.the national weather service in)/i;

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
  /\s+((?:Local\s+)?(Warning|Watch|Advisory|Statement|Outlook|Message|Bulletin|Alert))$/i;

/**
 * The badge says what kind of alert it is, so the name shouldn't say it again:
 * "Hurricane Warning" reads Warning + "Hurricane", "Flood Watch" Watch +
 * "Flood". The badge word follows the event's own last word where there is one
 * (Advisory, Statement), so a Small Craft Advisory is not mislabelled as a
 * Statement. An event whose tier comes from severity alone keeps its full name.
 */
// "Blue Alert" is the whole name of the product; stripping Alert would leave "Blue".
const KEEP_WHOLE = /^blue alert$/i;

export function alertLabels(alert: Pick<WeatherAlert, "event" | "tier">): {
  badge: string;
  name: string;
} {
  const suffix = LABEL_SUFFIX.exec(alert.event.trim())?.[2];
  const word = suffix ? suffix[0]!.toUpperCase() + suffix.slice(1).toLowerCase() : null;
  const tierWord = alert.tier === "warning" ? "Warning" : alert.tier === "watch" ? "Watch" : null;
  const badge = tierWord ?? word ?? "Alert";
  // Strip the suffix only when it is exactly what the badge already says.
  if (word && word === badge && !KEEP_WHOLE.test(alert.event.trim())) {
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

/**
 * Combines alert lists: one entry per NWS alert id (the first list wins), the
 * ones a later message replaces removed, ranked. The separate alerts are what
 * is stored; they are consolidated into rows only when read (see
 * consolidateAlerts), so no county's text is ever thrown away.
 */
export function mergeAlerts(...lists: WeatherAlert[][]): WeatherAlert[] {
  const byId = new Map<string, WeatherAlert>();
  for (const list of lists)
    for (const alert of list) if (!byId.has(alert.id)) byId.set(alert.id, alert);
  return sortAlerts(removeSuperseded([...byId.values()]));
}

/**
 * One row per event, for a host scanning a list. NWS issues a separate alert
 * for each county or zone group a product covers — during a hurricane, a
 * dozen Hurricane Warnings — and each carries its own forecast, impacts and
 * contacts, or for a flood warning its own river. So the row summarizes and
 * every alert stays under it as a member: the places are the union, the
 * strongest tier, severity and urgency win, and the newest supplies the
 * header. A "Local Statement" is the one exception: it is a single running
 * statement NWS reissues, so only the newest is kept.
 */
export function consolidateAlerts(alerts: WeatherAlert[]): WeatherAlert[] {
  const groups = new Map<string, WeatherAlert[]>();
  for (const alert of removeSuperseded(alerts)) {
    const key = alert.event.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), alert]);
  }
  return sortAlerts([...groups.values()].map(mergeEventGroup));
}

const RUNNING_STATEMENT = /local statement$/i;

function strongest(values: string[], rank: Record<string, number>): string {
  return values.reduce((best, value) => ((rank[value] ?? 4) < (rank[best] ?? 4) ? value : best));
}

function mergeEventGroup(group: WeatherAlert[]): WeatherAlert {
  const newest = group.reduce((best, alert) =>
    timeMs(alert.issuedAt) > timeMs(best.issuedAt) ? alert : best,
  );
  if (group.length === 1) return group[0]!;
  if (RUNNING_STATEMENT.test(newest.event.trim())) return newest;

  const named = new Set(group.flatMap((alert) => alert.places));
  const order = (alert: WeatherAlert) =>
    Math.min(
      ...alert.places
        .map((place) => COVERAGE_COUNTIES.findIndex((c) => c.name === place))
        .filter((i) => i >= 0),
      99,
    );
  const members = [...group].sort(
    (a, b) =>
      order(a) - order(b) ||
      (a.areaDesc ?? "").localeCompare(b.areaDesc ?? "") ||
      timeMs(b.issuedAt) - timeMs(a.issuedAt),
  );
  const tier = group.reduce<AlertTier>(
    (best, alert) => (TIER_RANK[alert.tier] < TIER_RANK[best] ? alert.tier : best),
    "statement",
  );
  const openEnded = group.some((alert) => !alert.endsAt);
  const latestEnd = group.reduce(
    (latest, alert) => (timeMs(alert.endsAt) > timeMs(latest) ? (alert.endsAt as string) : latest),
    "",
  );
  return {
    ...newest,
    tier,
    severity: strongest(
      group.map((alert) => alert.severity),
      SEVERITY_RANK,
    ),
    urgency: strongest(
      group.map((alert) => alert.urgency),
      URGENCY_RANK,
    ),
    places: COVERAGE_COUNTIES.map((county) => county.name).filter((name) => named.has(name)),
    endsAt: openEnded || !latestEnd ? null : latestEnd,
    members,
  };
}

/** Whether a consolidated row's members do not all end at the same time (or one has no end). */
export function membersEndAtDifferentTimes(alert: WeatherAlert): boolean {
  const ends = new Set((alert.members ?? []).map((member) => member.endsAt ?? "none"));
  return ends.size > 1;
}

/**
 * The places line for an alert: only the coverage counties, all of them (there
 * are four at most). An alert with no county codes falls back to the first
 * few zones NWS named, abbreviated.
 */
export function alertPlaces(alert: Pick<WeatherAlert, "places" | "areaDesc">): string | null {
  if (alert.places.length > 0) return alert.places.join(", ");
  return abbreviateAreas(alert.areaDesc);
}
