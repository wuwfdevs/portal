import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DescriptionList, type DescriptionItem } from "@/components/ui/description-list";
import { EmptyState } from "@/components/ui/empty-state";
import { CardHeader, SectionHeading } from "@/components/ui/section-heading";
import { getCurrentWeatherReading, getDailyOutlook, getForecastPeriods } from "@/lib/log/weather";
import { refreshWeatherAction } from "../../weather-actions";
import { LogPoller } from "../../log-poller";
import { SourceHeader } from "../source-header";
import { formatStationTimestamp } from "@/lib/log/timezone";
import { WeatherOutlookStrip } from "@/components/log/weather-outlook-strip";

// Weather is allowed to be 30 minutes old (lib/log/staleness.ts); this only needs
// to re-run that check often enough to notice — see log-poller.tsx.
const POLL_INTERVAL_MS = 5 * 60_000;

export default async function WeatherPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { reading, stale, refreshError } = await getCurrentWeatherReading();
  const details: DescriptionItem[] = reading
    ? [
        ...(reading.current_temp !== null || reading.current_conditions !== null
          ? [
              {
                label: "Now",
                value: `${reading.current_temp !== null ? `${reading.current_temp}°` : ""}${
                  reading.current_temp !== null && reading.current_conditions !== null ? " " : ""
                }${reading.current_conditions ?? ""}`,
              },
            ]
          : []),
        {
          label: "High / Low",
          value: `${reading.high_temp ?? "—"}° / ${reading.low_temp ?? "—"}°`,
        },
        { label: "Conditions", value: reading.conditions_summary },
        ...(reading.precipitation_notes
          ? [{ label: "Precipitation", value: reading.precipitation_notes }]
          : []),
        { label: "Last updated", value: formatStationTimestamp(reading.last_updated_at) },
        { label: "Valid through", value: formatStationTimestamp(reading.valid_through_at) },
        { label: "Source", value: reading.source },
      ]
    : [];

  return (
    <div className="max-w-2xl">
      <LogPoller intervalMs={POLL_INTERVAL_MS} />
      <SourceHeader title="Weather" />

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
        <EmptyState>
          No weather reading yet. Click Refresh to fetch the current forecast.
          <form action={refreshWeatherAction} className="mt-4">
            <Button type="submit">Refresh</Button>
          </form>
        </EmptyState>
      ) : (
        <Card>
          <CardHeader className="flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span>{reading.forecast_area}</span>
              {stale && <Badge variant="warning">Stale</Badge>}
            </div>
            <form action={refreshWeatherAction}>
              <Button type="submit" variant="secondary">
                Refresh
              </Button>
            </form>
          </CardHeader>
          <div className="flex flex-col gap-4 p-5 text-sm text-ink-700">
            {reading.hazards && <Alert variant="danger">{reading.hazards}</Alert>}

            <div>
              <SectionHeading level="eyebrow" as="h3" className="mb-1.5">
                Forecast
              </SectionHeading>
              <WeatherOutlookStrip
                days={getDailyOutlook(reading)}
                liveRead={{
                  periods: getForecastPeriods(reading),
                  fallbackText: reading.live_read_text,
                }}
              />
            </div>

            <div>
              <SectionHeading level="eyebrow" as="h3" className="mb-1">
                Condensed (for a tight break)
              </SectionHeading>
              <p>{reading.condensed_text}</p>
            </div>

            <DescriptionList columns={3} items={details} />
          </div>
        </Card>
      )}
    </div>
  );
}
