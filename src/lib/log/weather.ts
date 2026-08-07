import "server-only";

// Lazy-refresh orchestration for the weather live-read — same "no job queue"
// shape as lib/log/npr.ts, see its header. A fetch failure never clears the
// display; the last-known current reading stays visible, flagged stale.

import { createClient } from "@/lib/supabase/server";
import { getCurrentWeatherReadingRow, type LogWeatherReadingRow } from "./queries";
import { fetchWeatherReading } from "./providers/weather";
import { checkStaleness, WEATHER_STALE_THRESHOLD_MS } from "./staleness";

export interface WeatherResult {
  reading: LogWeatherReadingRow | null;
  stale: boolean;
  refreshError: string | null;
}

/** Flips the previous current row to false and inserts the freshly fetched reading as the new current one — the revision-history rule from docs/log-design.md §5/§8. */
async function replaceCurrentWeatherReading(): Promise<LogWeatherReadingRow> {
  const fetched = await fetchWeatherReading();
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("log_weather_reading")
    .update({ is_current: false })
    .eq("is_current", true);
  if (clearError) throw new Error(clearError.message);

  const { data, error } = await supabase
    .from("log_weather_reading")
    .insert({ ...fetched, is_current: true, last_updated_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
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
