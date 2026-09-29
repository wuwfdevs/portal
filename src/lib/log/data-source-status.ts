import "server-only";

// Loads each outside source's status for the Sources overview's cards
// (lib/log/data-sources.ts has the list and the pure state rule). Weather goes
// through its ordinary lazy-refresh read, the same one its own page makes, so
// opening the overview keeps it current. NPR is cached per program and show
// date, so there is no single "the NPR feed" to refresh from here — the card
// reports the most recently retrieved episode, and refreshing happens on the
// NPR page for a chosen program and date.

import { deriveDataSourceState, type DataSourceKey, type DataSourceState } from "./data-sources";
import { getLatestNprEpisodeSummary } from "./queries";
import { isNprCdsConfigured } from "./providers/npr";
import { getCurrentWeatherReading } from "./weather";
import { NPR_STALE_THRESHOLD_MS, WEATHER_STALE_THRESHOLD_MS } from "./staleness";

export interface DataSourceStatus {
  key: DataSourceKey;
  state: DataSourceState;
  lastUpdatedAt: string | null;
  /** What the saved data currently is, in a few words ("Morning Edition, Sep 29 · 14 stories"). */
  latest: string | null;
  /** The message from a refresh that failed on this read, if one did. */
  refreshError: string | null;
}

function formatShowDate(showDateISO: string): string {
  // A plain calendar date — format it as one, not as an instant in some zone.
  const [year, month, day] = showDateISO.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

async function nprStatus(nowISO: string): Promise<DataSourceStatus> {
  const configured = isNprCdsConfigured();
  const latest = await getLatestNprEpisodeSummary();
  const lastUpdatedAt = latest?.episode.retrieved_at ?? null;

  let latestLabel: string | null = null;
  if (latest) {
    const program = latest.programName ?? "A program";
    const when = formatShowDate(latest.episode.show_date);
    latestLabel =
      latest.episode.status === "not_found"
        ? `${program}, ${when} · no episode`
        : `${program}, ${when} · ${latest.itemCount} ${latest.itemCount === 1 ? "story" : "stories"}`;
  }

  return {
    key: "npr",
    state: deriveDataSourceState({
      configured,
      lastUpdatedAt,
      staleAfterMs: NPR_STALE_THRESHOLD_MS,
      refreshFailed: false,
      nowISO,
    }),
    lastUpdatedAt,
    latest: latestLabel,
    refreshError: null,
  };
}

async function weatherStatus(nowISO: string): Promise<DataSourceStatus> {
  const { reading, refreshError } = await getCurrentWeatherReading();
  const lastUpdatedAt = reading?.last_updated_at ?? null;

  return {
    key: "weather",
    state: deriveDataSourceState({
      // api.weather.gov needs no key; there is always a default location.
      configured: true,
      lastUpdatedAt,
      staleAfterMs: WEATHER_STALE_THRESHOLD_MS,
      refreshFailed: refreshError !== null,
      nowISO,
    }),
    lastUpdatedAt,
    latest: reading ? `${reading.forecast_area} · ${reading.conditions_summary}` : null,
    refreshError,
  };
}

export async function loadDataSourceStatuses(): Promise<Record<DataSourceKey, DataSourceStatus>> {
  const nowISO = new Date().toISOString();
  const [npr, weather] = await Promise.all([nprStatus(nowISO), weatherStatus(nowISO)]);
  return { npr, weather };
}
