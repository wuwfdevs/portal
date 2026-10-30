import { trimToNull } from "@/lib/validation";
import "server-only";
import {
  buildDailyOutlook,
  type DailyOutlookEntry,
  type ForecastPeriodSummary,
} from "../weather-outlook";
import { alertsToHazards, mergeAlerts, parseNwsAlerts, type WeatherAlert } from "../weather-alerts";

// Weather integration for log_weather_reading (docs/log-design.md §5, §8).
// Unlike NPR (see providers/npr.ts), there's a workable default here that
// needs no vendor decision or API key: the National Weather Service's public
// api.weather.gov — free, no account, no key, stable, and the U.S.
// government's own forecast source. That doesn't fully close the open
// question in docs/log-design.md §7 ("Which weather API/vendor, and what's
// in its contract terms about update frequency and forecast-area
// granularity") — WUWF may end up preferring a commercial source with a
// broadcast-specific format — but it means this slice ships a real, working
// live-read instead of another "not configured" placeholder. Swapping
// providers later only touches this file; lib/log/weather.ts and the schema
// don't know or care which one is behind fetchWeatherReading().
//
// NWS's usage policy requires a descriptive User-Agent identifying the
// application; see userAgent() below.

const API_BASE = "https://api.weather.gov";

// WUWF's Pensacola, FL studio location (University of West Florida).
// Override via WEATHER_LATITUDE/WEATHER_LONGITUDE if the forecast area
// should point somewhere else.
const DEFAULT_LATITUDE = "30.5433";
const DEFAULT_LONGITUDE = "-87.2169";
const DEFAULT_FORECAST_AREA = "Pensacola, FL";

function userAgent(): string {
  const contact = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "tools-support@wuwf.org";
  return `(tools.wuwf.org Log, ${contact})`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": userAgent(), Accept: "application/geo+json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`The weather service returned an error (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

interface PointsResponse {
  properties: {
    forecast: string;
    observationStations?: string;
    relativeLocation?: { properties?: { city?: string; state?: string } };
  };
}

interface StationsResponse {
  features: Array<{ id?: string }>;
}

interface ObservationResponse {
  properties: {
    temperature?: { unitCode?: string; value?: number | null };
    textDescription?: string | null;
  };
}

interface ForecastPeriod {
  name: string;
  startTime: string;
  isDaytime: boolean;
  temperature: number;
  shortForecast: string;
  detailedForecast: string;
  endTime: string;
  icon: string | null;
  probabilityOfPrecipitation: { value: number | null } | null;
}

interface ForecastResponse {
  properties: { periods: ForecastPeriod[] };
}

export interface WeatherReading {
  forecast_area: string;
  source: string;
  live_read_text: string;
  condensed_text: string;
  high_temp: number | null;
  low_temp: number | null;
  current_temp: number | null;
  current_conditions: string | null;
  conditions_summary: string;
  precipitation_notes: string | null;
  hazards: string | null;
  /** Structured active alerts, ranked. Null means the alerts check itself failed (distinct from an empty list, which means all clear). */
  alerts: WeatherAlert[] | null;
  valid_through_at: string;
  daily_outlook: DailyOutlookEntry[];
  forecast_periods: ForecastPeriodSummary[];
}

/**
 * Active watches, warnings and statements for WUWF's coverage. The point
 * query for the studio is the required half: everything NWS says covers
 * Pensacola, so a failure there throws and the caller can tell "no alerts"
 * from "couldn't check". The state-wide query (Florida and Alabama, filtered
 * to the coverage counties by their SAME codes) is best-effort and adds
 * what the point query cannot see, such as a warning for Mobile County alone.
 */
export async function fetchWeatherAlerts(
  latitude: string = process.env.WEATHER_LATITUDE || DEFAULT_LATITUDE,
  longitude: string = process.env.WEATHER_LONGITUDE || DEFAULT_LONGITUDE,
): Promise<WeatherAlert[]> {
  type Response = Parameters<typeof parseNwsAlerts>[0];
  const point = parseNwsAlerts(
    await getJson<Response>(`${API_BASE}/alerts/active?point=${latitude},${longitude}`),
  );
  let region: WeatherAlert[] = [];
  try {
    region = parseNwsAlerts(await getJson<Response>(`${API_BASE}/alerts/active?area=FL,AL`)).filter(
      (alert) => alert.places.length > 0,
    );
  } catch {
    // The point query already answered for the studio's own county.
  }
  return mergeAlerts(point, region);
}

/** Fetches the current live-read from NWS. Throws with a clear message on any failure — lib/log/weather.ts catches it and falls back to the last-known reading, per §6/§22's "never make the display unreadable." */
export async function fetchWeatherReading(): Promise<WeatherReading> {
  const latitude = process.env.WEATHER_LATITUDE || DEFAULT_LATITUDE;
  const longitude = process.env.WEATHER_LONGITUDE || DEFAULT_LONGITUDE;

  const points = await getJson<PointsResponse>(`${API_BASE}/points/${latitude},${longitude}`);
  const forecast = await getJson<ForecastResponse>(points.properties.forecast);
  const periods = forecast.properties.periods;
  if (periods.length === 0) {
    throw new Error("The weather service returned no forecast periods.");
  }

  const dayPeriod = periods.find((period) => period.isDaytime) ?? periods[0]!;
  const nightPeriod = periods.find((period) => !period.isDaytime && period !== dayPeriod) ?? null;

  // The current observation ("72° Partly Cloudy") comes from the nearest
  // station's latest report, not the forecast — best-effort like hazards
  // below: the observations endpoint failing must never block a usable
  // forecast reading. NWS reports temperature in °C; convert to °F.
  let currentTemp: number | null = null;
  let currentConditions: string | null = null;
  try {
    const stationsUrl = points.properties.observationStations;
    if (stationsUrl) {
      const stations = await getJson<StationsResponse>(stationsUrl);
      const stationUrl = stations.features.find((feature) => feature.id)?.id;
      if (stationUrl) {
        const observation = await getJson<ObservationResponse>(`${stationUrl}/observations/latest`);
        const temperature = observation.properties.temperature;
        if (typeof temperature?.value === "number") {
          currentTemp = temperature.unitCode?.endsWith("degF")
            ? Math.round(temperature.value)
            : Math.round((temperature.value * 9) / 5 + 32);
        }
        currentConditions = trimToNull(observation.properties.textDescription);
      }
    }
  } catch {
    // Leave both null — the widget falls back to forecast-only display.
  }

  // Alerts are best-effort for the forecast (a failed alerts call never blocks
  // a usable reading) but not silent: null tells lib/log/weather.ts the check
  // failed, so it keeps the last good alerts and flags them rather than
  // presenting "no alerts".
  let alerts: WeatherAlert[] | null = null;
  try {
    alerts = await fetchWeatherAlerts(latitude, longitude);
  } catch {
    alerts = null;
  }
  const hazards = alerts ? alertsToHazards(alerts) : null;

  const cityState = points.properties.relativeLocation?.properties;
  const forecastArea =
    cityState?.city && cityState?.state
      ? `${cityState.city}, ${cityState.state}`
      : DEFAULT_FORECAST_AREA;

  // Each period's detailedForecast is already a complete, self-contained
  // paragraph from NWS (its own precipitation-chance sentence and all) — a
  // bare join reads as one run-on blob that repeats itself with no sense of
  // where "today" ends and "tonight" begins. Label each half with NWS's own
  // period name so the boundary is legible to a host reading it on air.
  // forecastPeriods keeps the same two halves separate (label + text) for
  // screens that render them apart visually — live_read_text stays this one
  // flat string because the "Edit for this airing" override form needs a
  // plain string to prefill its textarea.
  const forecastPeriods: ForecastPeriodSummary[] = [
    dayPeriod.detailedForecast ? { label: dayPeriod.name, text: dayPeriod.detailedForecast } : null,
    nightPeriod?.detailedForecast
      ? { label: nightPeriod.name, text: nightPeriod.detailedForecast }
      : null,
  ].filter((period): period is ForecastPeriodSummary => period !== null);

  const liveReadText = forecastPeriods.map((period) => `${period.label}: ${period.text}`).join(" ");

  // periods already covers the next several days (NWS's /forecast endpoint
  // typically returns ~14 day/night periods) — daily_outlook just groups
  // and condenses what's already been fetched, no second request.
  const dailyOutlook = buildDailyOutlook(periods);

  return {
    forecast_area: forecastArea,
    source: "National Weather Service (api.weather.gov)",
    live_read_text: liveReadText,
    condensed_text: dayPeriod.shortForecast,
    high_temp: dayPeriod.temperature,
    low_temp: nightPeriod?.temperature ?? null,
    current_temp: currentTemp,
    current_conditions: currentConditions,
    conditions_summary: dayPeriod.shortForecast,
    precipitation_notes: null,
    hazards,
    alerts,
    valid_through_at: (nightPeriod ?? dayPeriod).endTime,
    daily_outlook: dailyOutlook,
    forecast_periods: forecastPeriods,
  };
}
