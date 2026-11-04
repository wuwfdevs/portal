import { STATION_TIME_ZONE } from "@/lib/station-time";

/**
 * How the station names itself on screen: the shape every surface reads, and the neutral wording used
 * while a station has not filled its settings in yet.
 *
 * Pure (no Supabase, no React) so server components, client components and tests all use the same
 * rules. The data comes from `public.station_public_profile()` (lib/station.ts reads it; the root layout
 * hands it to client components through components/station-provider.tsx). The wall clock is separate
 * (lib/station-time.ts) because it has to be synchronous.
 *
 * Every field the database leaves empty falls back to something that reads correctly in a sentence, so a
 * fresh install says "the station" rather than "null" or another station's name.
 */

/** The logo file, a path under public/ or an https URL. WUWF's is the default until a station sets its own. */
export const STATION_LOGO_SRC = process.env.NEXT_PUBLIC_STATION_LOGO?.trim() || "/wuwf-logo.png";

export type StationNotice = {
  text: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
};

export type StationProfile = {
  /** "WUWF Public Media". Falls back to the short name, then "Station". */
  name: string;
  /** "WUWF". Falls back to the name, then "the station" (which reads mid-sentence). */
  shortName: string;
  callSign: string | null;
  city: string | null;
  region: string | null;
  /** "Pensacola and Northwest Florida"; else "City, Region"; else "its community". */
  coverageArea: string;
  supportEmail: string | null;
  /** The sign-off under a public form: "— WUWF Public Media, Pensacola, FL". */
  attribution: string;
  /** The notice under every public form, or null when the station has none. */
  notice: StationNotice | null;
  /** True once the station has set a name; false on a fresh install. */
  named: boolean;
};

type RawProfile = Record<string, string | null | undefined> | null | undefined;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function stationProfileFrom(raw: RawProfile): StationProfile {
  const displayName = clean(raw?.display_name);
  const short = clean(raw?.short_name);
  const city = clean(raw?.primary_city);
  const region = clean(raw?.region);

  const name = displayName ?? short ?? "Station";
  const shortName = short ?? displayName ?? "the station";

  const coverage =
    clean(raw?.coverage_area) ??
    (city && region ? `${city}, ${region}` : (city ?? region)) ??
    "its community";

  const notice: StationNotice = {
    text: clean(raw?.public_notice_text),
    linkLabel: clean(raw?.public_notice_link_label),
    linkUrl: clean(raw?.public_notice_link_url),
  };
  const hasNotice = notice.text !== null || (notice.linkLabel !== null && notice.linkUrl !== null);

  return {
    name,
    shortName,
    callSign: clean(raw?.call_sign),
    city,
    region,
    coverageArea: coverage,
    supportEmail: clean(raw?.support_email),
    attribution: clean(raw?.public_attribution) ?? `— ${name}`,
    notice: hasNotice ? notice : null,
    named: displayName !== null || short !== null,
  };
}

/** The title for the portal itself: "WUWF Tools", or "Station Tools" before a name is set. */
export function toolsTitle(profile: StationProfile): string {
  return `${profile.named ? profile.shortName : "Station"} Tools`;
}

/** "Pensacola, Florida"; just the city or the region when only one is set; else the coverage area. */
export function stationPlace(station: StationProfile): string {
  if (station.city && station.region) return `${station.city}, ${station.region}`;
  return station.city ?? station.region ?? station.coverageArea;
}

/**
 * Fills the placeholders in an AI prompt: {{station}} (the short name), {{tools}} (the portal's title),
 * {{area}} (who the station serves), {{callsign}} (the call sign, else the name) and {{place}} (where the
 * studio is). Prompts are written with these rather than a station's name so
 * the same text serves any station; this runs once, where the prompt is assembled.
 */
export function fillStation(text: string, station: StationProfile): string {
  return text
    .replaceAll("{{station}}", station.shortName)
    .replaceAll("{{tools}}", toolsTitle(station))
    .replaceAll("{{area}}", station.coverageArea)
    .replaceAll("{{callsign}}", station.callSign ?? station.name)
    .replaceAll("{{place}}", stationPlace(station));
}

/**
 * Where a web search should look, for a model's `user_location`: the station's own city and region when
 * it has set them, and its time zone. Omits what is unknown rather than guess.
 */
export function searchLocation(station: StationProfile): {
  type: "approximate";
  city?: string;
  region?: string;
  country: "US";
  timezone: string;
} {
  return {
    type: "approximate",
    ...(station.city ? { city: station.city } : {}),
    ...(station.region ? { region: station.region } : {}),
    country: "US",
    timezone: STATION_TIME_ZONE,
  };
}

/** Upper-cases the first letter, for a name that opens a sentence ("the station" → "The station"). */
export function sentenceStart(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The domain of the support address, for an email placeholder; null when there is none. */
export function emailDomain(profile: StationProfile): string | null {
  const at = profile.supportEmail?.lastIndexOf("@") ?? -1;
  return at >= 0 && profile.supportEmail ? profile.supportEmail.slice(at + 1) : null;
}

/** "you@wuwf.org", or "you@example.org" while the station has no address on file. */
export function emailPlaceholder(profile: StationProfile, local = "you"): string {
  return `${local}@${emailDomain(profile) ?? "example.org"}`;
}
