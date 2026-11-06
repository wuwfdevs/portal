/**
 * Where the station is, for the weather on air: the studio's coordinates and the counties whose alerts the
 * station relays. Both are the station's settings (`public.station_settings`), not constants; this module
 * turns the row into what the weather code takes. Pure, so it is tested without a database.
 */

/** One county whose alerts matter to the station, by the SAME (FIPS) code NWS tags an alert with. */
export interface CoverageCounty {
  name: string;
  /** Six digits: 0, a two-digit state code, a three-digit county code. */
  same: string;
}

/** What the weather code needs to fetch for one station. */
export interface WeatherLocation {
  latitude: string;
  longitude: string;
  /** In display order. May be empty: the station then relays whatever NWS matched to its point. */
  counties: CoverageCounty[];
  /** Postal abbreviations of the states the counties are in, for the regional alert query. */
  states: string[];
  /** Used for the forecast area when NWS names none. */
  fallbackArea: string;
  /** The User-Agent NWS requires to identify the application. */
  userAgent: string;
}

/** State FIPS code (the middle two digits of a SAME code) → postal abbreviation. */
const STATE_BY_FIPS: Readonly<Record<string, string>> = {
  "01": "AL",
  "02": "AK",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT",
  "10": "DE",
  "11": "DC",
  "12": "FL",
  "13": "GA",
  "15": "HI",
  "16": "ID",
  "17": "IL",
  "18": "IN",
  "19": "IA",
  "20": "KS",
  "21": "KY",
  "22": "LA",
  "23": "ME",
  "24": "MD",
  "25": "MA",
  "26": "MI",
  "27": "MN",
  "28": "MS",
  "29": "MO",
  "30": "MT",
  "31": "NE",
  "32": "NV",
  "33": "NH",
  "34": "NJ",
  "35": "NM",
  "36": "NY",
  "37": "NC",
  "38": "ND",
  "39": "OH",
  "40": "OK",
  "41": "OR",
  "42": "PA",
  "44": "RI",
  "45": "SC",
  "46": "SD",
  "47": "TN",
  "48": "TX",
  "49": "UT",
  "50": "VT",
  "51": "VA",
  "53": "WA",
  "54": "WV",
  "55": "WI",
  "56": "WY",
  "72": "PR",
};

// A county, a colon and its six-digit SAME code. Spaces around the colon are tolerated on the way in and
// dropped on the way out, so the stored text always matches the database's stricter pattern.
const LINE = /^([^:\n]+?)\s*:\s*([0-9]{6})$/;

/** Reads the stored text ("Escambia:012033", one county per line). Lines that are not one are skipped. */
export function parseCoverageCounties(text: string | null | undefined): CoverageCounty[] {
  const counties: CoverageCounty[] = [];
  for (const raw of (text ?? "").split("\n")) {
    const match = LINE.exec(raw.trim());
    if (match) counties.push({ name: match[1]!.trim(), same: match[2]! });
  }
  return counties;
}

/** The text a settings form shows for a list of counties. */
export function formatCoverageCounties(counties: readonly CoverageCounty[]): string {
  return counties.map((county) => `${county.name}:${county.same}`).join("\n");
}

/**
 * Why a county list typed into the settings form cannot be saved, or null when it can. Stricter than the
 * reader above on purpose: a typo here would silently drop a county's alerts from the air.
 */
export function coverageCountiesProblem(text: string): string | null {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const seen = new Set<string>();
  for (const line of lines) {
    const match = LINE.exec(line);
    if (!match) {
      return `"${line}" is not a county. Write one per line as a name, a colon and the six-digit SAME code: Escambia:012033.`;
    }
    const code = match[2]!;
    if (!STATE_BY_FIPS[code.slice(1, 3)]) {
      return `"${line}": ${code.slice(1, 3)} is not a state code in a SAME code (0, two digits for the state, three for the county).`;
    }
    if (seen.has(code)) return `The code ${code} is listed twice.`;
    seen.add(code);
  }
  return lines.length > 1000 / 8 ? "That is more counties than the settings can hold." : null;
}

/** The states the counties are in, in the order they first appear. */
export function statesForCounties(counties: readonly CoverageCounty[]): string[] {
  const states: string[] = [];
  for (const county of counties) {
    const state = STATE_BY_FIPS[county.same.slice(1, 3)];
    if (state && !states.includes(state)) states.push(state);
  }
  return states;
}

/** NWS asks for a User-Agent that names the application and a way to reach its operator. */
export function weatherUserAgent(siteUrl: string | undefined, contact: string | null): string {
  let host = "tools portal";
  try {
    if (siteUrl) host = new URL(siteUrl).host;
  } catch {
    // Keep the generic name; a malformed site URL must not stop the weather.
  }
  return contact ? `(${host} Log, ${contact})` : `(${host} Log)`;
}

/**
 * The weather location from the station's settings row, or null when the studio's coordinates are not
 * set: the weather source then says so instead of reading some other place's forecast on the air.
 */
export function weatherLocationFrom(
  station: {
    latitude: number | string | null;
    longitude: number | string | null;
    alert_counties: string | null;
    primary_city: string | null;
    region: string | null;
    support_email: string | null;
  },
  environment: { siteUrl?: string; supportEmail?: string } = {},
): WeatherLocation | null {
  if (station.latitude === null || station.longitude === null) return null;
  const counties = parseCoverageCounties(station.alert_counties);
  const city = station.primary_city?.trim() || null;
  const region = station.region?.trim() || null;
  return {
    latitude: String(station.latitude),
    longitude: String(station.longitude),
    counties,
    states: statesForCounties(counties),
    fallbackArea: city && region ? `${city}, ${region}` : (city ?? region ?? "the studio's area"),
    userAgent: weatherUserAgent(
      environment.siteUrl,
      station.support_email?.trim() || environment.supportEmail?.trim() || null,
    ),
  };
}

/** Said when the weather is asked for before the station has set where it is. */
export const WEATHER_LOCATION_NOT_SET =
  "The studio's location isn't set yet. An administrator can enter its latitude and longitude at Administration → Station.";
