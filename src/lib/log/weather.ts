import "server-only";

// Lazy-refresh orchestration for the weather live-read — same "no job queue"
// shape as lib/log/npr.ts, see its header. A fetch failure never clears the
// display; the last-known current reading stays visible, flagged stale.

import { createClient } from "@/lib/supabase/server";
import { getCurrentWeatherReadingRow, type LogWeatherReadingRow } from "./queries";
import { fetchWeatherAlerts, fetchWeatherReading } from "./providers/weather";
import { checkStaleness, WEATHER_ALERTS_STALE_THRESHOLD_MS, WEATHER_STALE_THRESHOLD_MS } from "./staleness";
import { activeAlerts, alertsCheckState, alertsToHazards, readStoredAlerts, type AlertsCheckState, type WeatherAlert } from "./weather-alerts";
import type { DailyOutlookEntry, ForecastPeriodSummary } from "./weather-outlook";

/** Typed accessor for the row's jsonb daily_outlook column (stored as `unknown` in database.types.ts, the same convention as every other plain jsonb column here) — this repo's own shape, never user input, so a direct cast is safe. */
export function getDailyOutlook(reading: LogWeatherReadingRow): DailyOutlookEntry[] {
  return (reading.daily_outlook as DailyOutlookEntry[] | null) ?? [];
}

/** Same convention as getDailyOutlook, for the live-read text's own day/night halves. */
export function getForecastPeriods(reading: LogWeatherReadingRow): ForecastPeriodSummary[] {
  return (reading.forecast_periods as ForecastPeriodSummary[] | null) ?? [];
}

/** The stored alerts and how far to trust them — the panel's whole input. */
export function getAlertsView(reading: LogWeatherReadingRow): {
  alerts: WeatherAlert[];
  state: AlertsCheckState;
  checkedAt: string | null;
} {
  const alerts = activeAlerts(readStoredAlerts(reading.alerts), new Date().toISOString());
  return {
    alerts,
    state: alertsCheckState(alerts, reading.alerts_checked_at, reading.alerts_check_failed),
    checkedAt: reading.alerts_checked_at,
  };
}

export interface WeatherResult {
  reading: LogWeatherReadingRow | null;
  stale: boolean;
  refreshError: string | null;
}

/** Flips the previous current row to false and inserts the freshly fetched reading as the new current one — the revision-history rule from docs/log-design.md §5/§8. */
async function replaceCurrentWeatherReading(): Promise<LogWeatherReadingRow> {
  const fetched = await fetchWeatherReading();
  const supabase = await createClient();
  const previous = await getCurrentWeatherReadingRow();
  const now = new Date().toISOString();

  // A failed alerts check (alerts === null) must never read as "all clear":
  // carry the last good alerts forward and flag the check as failed.
  const { alerts, ...forecast } = fetched;
  const alertColumns = alerts
    ? {
        alerts,
        hazards: alertsToHazards(alerts),
        alerts_checked_at: now,
        alerts_attempted_at: now,
        alerts_check_failed: false,
      }
    : {
        alerts: previous?.alerts ?? [],
        hazards: previous?.hazards ?? null,
        alerts_checked_at: previous?.alerts_checked_at ?? null,
        alerts_attempted_at: now,
        alerts_check_failed: true,
      };

  const { error: clearError } = await supabase
    .from("log_weather_reading")
    .update({ is_current: false })
    .eq("is_current", true);
  if (clearError) throw new Error(clearError.message);

  const { data, error } = await supabase
    .from("log_weather_reading")
    .insert({ ...forecast, ...alertColumns, is_current: true, last_updated_at: now })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Rechecks only the alerts on the current row. Alerts get a much shorter
 * clock than the forecast, and a rundown open during a storm must not wait
 * half an hour to learn a warning was issued. A failure keeps the last good
 * alerts and flags them; it never clears them.
 */
async function refreshCurrentAlerts(reading: LogWeatherReadingRow): Promise<LogWeatherReadingRow> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  let changes: Partial<LogWeatherReadingRow>;
  try {
    const alerts = await fetchWeatherAlerts();
    changes = {
      alerts,
      hazards: alertsToHazards(alerts),
      alerts_checked_at: now,
      alerts_attempted_at: now,
      alerts_check_failed: false,
    };
  } catch {
    changes = { alerts_attempted_at: now, alerts_check_failed: true };
  }
  const { data, error } = await supabase
    .from("log_weather_reading")
    .update(changes)
    .eq("id", reading.id)
    .eq("is_current", true)
    .select("*")
    .maybeSingle();
  // The alerts view is a refinement of a reading we already have; if the
  // write fails or the row was superseded meanwhile, serve what we had.
  if (error || !data) return { ...reading, ...changes };
  return data;
}

/** Lazy-refresh read: returns the current reading, refetching first if it's stale or missing. Never throws — a refetch failure is reported via refreshError, not an exception. */
export async function getCurrentWeatherReading(): Promise<WeatherResult> {
  let reading = await getCurrentWeatherReadingRow();
  const { isStale } = checkStaleness(
    reading?.last_updated_at ?? null,
    WEATHER_STALE_THRESHOLD_MS,
    new Date().toISOString(),
  );

  let refreshError: string | null = null;
  if (isStale) {
    try {
      reading = await replaceCurrentWeatherReading();
    } catch (error) {
      refreshError = error instanceof Error ? error.message : "Could not refresh the weather reading.";
      // Keep serving whatever reading we already had, if any — never let a
      // failed refetch make the display blank.
    }
  }

  // The forecast is fresh enough, but alerts run on their own shorter clock.
  if (reading && !isStale) {
    const alertsStale = checkStaleness(
      reading.alerts_attempted_at ?? reading.last_updated_at,
      WEATHER_ALERTS_STALE_THRESHOLD_MS,
      new Date().toISOString(),
    );
    if (alertsStale.isStale) reading = await refreshCurrentAlerts(reading);
  }

  return { reading, stale: refreshError !== null, refreshError };
}

/** Force refresh, bypassing the staleness check — the manual "Refresh" button's action. */
export async function refreshWeatherReading(): Promise<{ error?: string }> {
  try {
    await replaceCurrentWeatherReading();
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not refresh the weather reading." };
  }
}
