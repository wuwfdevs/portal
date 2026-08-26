import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentWeatherReading, getDailyOutlook, getForecastPeriods } from "@/lib/log/weather";
import { refreshWeatherAction } from "../weather-actions";
import { LogPoller } from "../log-poller";
import { formatStationTimestamp } from "@/lib/log/timezone";
import { WeatherOutlookStrip } from "@/components/log/weather-outlook-strip";
import { ForecastSummary } from "@/components/log/forecast-summary";

const POLL_INTERVAL_MS = 60_000;

export default async function WeatherPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { reading, stale, refreshError } = await getCurrentWeatherReading();

  return (
    <div className="max-w-2xl">
      <LogPoller intervalMs={POLL_INTERVAL_MS} />

      {error && (
        <Alert className="mb-4" variant="danger">
          {error}
        </Alert>
      )}
      {!error && refreshError && (
        <Alert className="mb-4" variant="note">
          Couldn&apos;t refresh just now — showing the last known reading. ({refreshError})
        </Alert>
      )}

      {!reading ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No weather reading yet. Click Refresh to fetch the current forecast.
          <form action={refreshWeatherAction} className="mt-4">
            <Button type="submit">Refresh</Button>
          </form>
        </div>
      ) : (
        <div className="rounded border border-line">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-ink-900">{reading.forecast_area}</span>
              {stale && <Badge variant="warning">Stale</Badge>}
            </div>
            <form action={refreshWeatherAction}>
              <Button type="submit" variant="secondary">
                Refresh
              </Button>
            </form>
          </div>
          <div className="flex flex-col gap-4 p-5 text-sm text-ink-700">
            {reading.hazards && <Alert variant="danger">{reading.hazards}</Alert>}

            <div>
              <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-400">
                Next few days
              </div>
              <WeatherOutlookStrip days={getDailyOutlook(reading)} />
            </div>

            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">Live read</div>
              <ForecastSummary periods={getForecastPeriods(reading)} fallbackText={reading.live_read_text} />
            </div>

            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-400">
                Condensed (for a tight break)
              </div>
              <p>{reading.condensed_text}</p>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              {(reading.current_temp !== null || reading.current_conditions !== null) && (
                <div>
                  <dt className="text-ink-400">Now</dt>
                  <dd className="font-semibold text-ink-900">
                    {reading.current_temp !== null && `${reading.current_temp}°`}
                    {reading.current_temp !== null && reading.current_conditions !== null && " "}
                    {reading.current_conditions}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-ink-400">High / Low</dt>
                <dd className="font-semibold text-ink-900">
                  {reading.high_temp ?? "—"}° / {reading.low_temp ?? "—"}°
                </dd>
              </div>
              <div>
                <dt className="text-ink-400">Conditions</dt>
                <dd>{reading.conditions_summary}</dd>
              </div>
              {reading.precipitation_notes && (
                <div>
                  <dt className="text-ink-400">Precipitation</dt>
                  <dd>{reading.precipitation_notes}</dd>
                </div>
              )}
              <div>
                <dt className="text-ink-400">Last updated</dt>
                <dd>{formatStationTimestamp(reading.last_updated_at)}</dd>
              </div>
              <div>
                <dt className="text-ink-400">Valid through</dt>
                <dd>{formatStationTimestamp(reading.valid_through_at)}</dd>
              </div>
              <div>
                <dt className="text-ink-400">Source</dt>
                <dd>{reading.source}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
