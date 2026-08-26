// Pure grouping/categorization for the multi-day "at a glance" weather
// outlook (requested directly: future days digestible as icon + hi/lo
// chips, not another block of paragraph text like today's live-read). No
// "server-only" — plain data transformation, safe to unit test directly and
// to import from the (server) screens that render it. See
// providers/weather.ts, which already fetches the full multi-day periods
// array from NWS's /forecast endpoint and, until this module existed, threw
// away everything past the first day/night pair.

export type WeatherIconCode =
  | "sunny"
  | "clear-night"
  | "partly-cloudy"
  | "partly-cloudy-night"
  | "cloudy"
  | "fog"
  | "rain"
  | "thunderstorm"
  | "snow"
  | "wind"
  | "severe";

export interface DailyOutlookEntry {
  date: string;
  day_label: string;
  high: number | null;
  low: number | null;
  short_forecast: string;
  precipitation_chance: number | null;
  icon: WeatherIconCode;
}

/** Shape of one NWS /forecast period this module needs — a subset of the real API response, kept close to its actual field names/nesting so test fixtures read like real responses. */
export interface OutlookSourcePeriod {
  startTime: string;
  isDaytime: boolean;
  temperature: number;
  shortForecast: string;
  icon: string | null;
  probabilityOfPrecipitation: { value: number | null } | null;
}

export const DEFAULT_OUTLOOK_DAYS = 5;

/**
 * NWS's /icons/{set}/{day|night}/{code},{pop}[/{code2},{pop2}] URLs encode a
 * compact condition code this repo maps into its own small icon set instead
 * of hotlinking the image itself (that icon service is documented as
 * legacy/reference-only, and an external image host is a new failure mode
 * this tool has otherwise avoided everywhere). A code missing from this
 * table — or no icon at all — falls back to categorizeFromText below.
 */
const ICON_CONDITION_CATEGORY: Record<string, WeatherIconCode | { day: WeatherIconCode; night: WeatherIconCode }> = {
  skc: { day: "sunny", night: "clear-night" },
  few: { day: "partly-cloudy", night: "partly-cloudy-night" },
  sct: { day: "partly-cloudy", night: "partly-cloudy-night" },
  bkn: "cloudy",
  ovc: "cloudy",
  fog: "fog",
  haze: "fog",
  smoke: "fog",
  dust: "fog",
  rain: "rain",
  rain_showers: "rain",
  rain_showers_hi: "rain",
  showers: "rain",
  fzra: "rain",
  rain_fzra: "rain",
  snow: "snow",
  rain_snow: "snow",
  snow_sleet: "snow",
  sleet: "snow",
  rain_sleet: "snow",
  snow_fzra: "snow",
  blizzard: "snow",
  tsra: "thunderstorm",
  tsra_sct: "thunderstorm",
  tsra_hi: "thunderstorm",
  tornado: "severe",
  hurricane: "severe",
  tropical_storm: "severe",
  hot: "sunny",
  cold: { day: "cloudy", night: "clear-night" },
};

function extractConditionCode(iconUrl: string): string | null {
  const withoutQuery = iconUrl.split("?")[0] ?? "";
  const segments = withoutQuery.split("/").filter(Boolean);
  const dayNightIndex = segments.findIndex((segment) => segment === "day" || segment === "night");
  const conditionSegment = dayNightIndex === -1 ? null : (segments[dayNightIndex + 1] ?? null);
  if (!conditionSegment) return null;
  const code = (conditionSegment.split(",")[0] ?? "").replace(/^wind_/, "");
  return code || null;
}

function categorizeFromText(shortForecast: string, isDaytime: boolean): WeatherIconCode {
  const text = shortForecast.toLowerCase();
  if (text.includes("thunderstorm")) return "thunderstorm";
  if (text.includes("snow") || text.includes("sleet") || text.includes("blizzard") || text.includes("flurries")) {
    return "snow";
  }
  if (text.includes("rain") || text.includes("shower") || text.includes("drizzle")) return "rain";
  if (text.includes("fog") || text.includes("haze") || text.includes("smoke")) return "fog";
  if (text.includes("partly") || text.includes("mostly sunny") || text.includes("mostly clear")) {
    return isDaytime ? "partly-cloudy" : "partly-cloudy-night";
  }
  if (text.includes("sunny") || text.includes("clear")) return isDaytime ? "sunny" : "clear-night";
  if (text.includes("windy") || text.includes("breezy")) return "wind";
  return "cloudy";
}

/** Which of this module's icon buckets a forecast period falls into — the icon URL's own condition code first, falling back to keyword-matching shortForecast when the icon is missing or its code isn't one this table recognizes. */
export function categorizeForecastIcon(iconUrl: string | null, shortForecast: string, isDaytime: boolean): WeatherIconCode {
  const code = iconUrl ? extractConditionCode(iconUrl) : null;
  const mapped = code ? ICON_CONDITION_CATEGORY[code] : undefined;
  if (mapped) return typeof mapped === "string" ? mapped : isDaytime ? mapped.day : mapped.night;
  return categorizeFromText(shortForecast, isDaytime);
}

function weekdayLabel(dateISO: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${dateISO}T12:00:00Z`),
  );
}

/**
 * Groups NWS's chronological day/night periods into one entry per calendar
 * date (using each period's own startTime, which NWS already returns in the
 * forecast area's local offset — no station-timezone conversion needed) and
 * reduces each day down to what an "at a glance" chip needs: hi/lo, one
 * short forecast line, precipitation chance, and an icon bucket. The first
 * group is always "Today" — periods arrive starting from whatever NWS
 * considers the current period, so index 0 is today regardless of wall
 * clock. Capped at maxDays; NWS's own /forecast periods rarely cover more
 * than 7.
 */
export function buildDailyOutlook(
  periods: OutlookSourcePeriod[],
  maxDays: number = DEFAULT_OUTLOOK_DAYS,
): DailyOutlookEntry[] {
  const groups: OutlookSourcePeriod[][] = [];
  for (const period of periods) {
    const date = period.startTime.slice(0, 10);
    const lastGroup = groups[groups.length - 1];
    const lastDate = lastGroup?.[0]?.startTime.slice(0, 10);
    if (lastGroup && lastDate === date) {
      lastGroup.push(period);
    } else {
      groups.push([period]);
    }
  }

  return groups.slice(0, maxDays).map((group, index) => {
    const date = group[0]!.startTime.slice(0, 10);
    const dayPeriod = group.find((period) => period.isDaytime) ?? null;
    const nightPeriod = group.find((period) => !period.isDaytime) ?? null;
    const leadPeriod = dayPeriod ?? nightPeriod ?? group[0]!;

    const precipitationCandidates = [dayPeriod, nightPeriod]
      .map((period) => period?.probabilityOfPrecipitation?.value ?? null)
      .filter((value): value is number => value !== null);

    return {
      date,
      day_label: index === 0 ? "Today" : weekdayLabel(date),
      high: dayPeriod?.temperature ?? null,
      low: nightPeriod?.temperature ?? null,
      short_forecast: leadPeriod.shortForecast,
      precipitation_chance: precipitationCandidates.length > 0 ? Math.max(...precipitationCandidates) : null,
      icon: categorizeForecastIcon(leadPeriod.icon, leadPeriod.shortForecast, leadPeriod.isDaytime),
    };
  });
}
