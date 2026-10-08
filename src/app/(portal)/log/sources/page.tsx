import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DescriptionList } from "@/components/ui/description-list";
import { PrimaryLink } from "@/components/ui/primary-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { DATA_SOURCES, formatStaleAfter } from "@/lib/log/data-sources";
import { loadDataSourceStatuses } from "@/lib/log/data-source-status";
import { DATA_SOURCE_STATE } from "@/lib/log/status-badges";
import { formatStationTimestamp } from "@/lib/log/timezone";
import { refreshWeatherAction } from "../weather-actions";
import { LogPoller } from "../log-poller";

// Weather's own page polls at this rate for the same reason — see log-poller.tsx.
const POLL_INTERVAL_MS = 5 * 60_000;

const NOT_CONFIGURED_NOTE: Record<string, string> = {
  npr: "Set NPR_CDS_TOKEN to turn this on.",
};

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const statuses = await loadDataSourceStatuses();

  return (
    <div>
      <LogPoller intervalMs={POLL_INTERVAL_MS} />

      <p className="mb-5 max-w-2xl text-sm text-ink-500">Outside feeds used in rundowns.</p>

      {error && (
        <Alert className="mb-4" variant="danger">
          {error}
        </Alert>
      )}

      <div className="grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {DATA_SOURCES.map((source) => {
          const status = statuses[source.key];
          return (
            <Card
              key={source.key}
              role="region"
              aria-labelledby={`source-${source.key}`}
              className="flex flex-col gap-4 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id={`source-${source.key}`} className="text-base font-bold text-ink-900">
                  <Link href={source.href} className="hover:text-brand-link">
                    {source.label}
                  </Link>
                </h2>
                <StatusBadge map={DATA_SOURCE_STATE} value={status.state} />
              </div>

              <p className="text-sm text-ink-500">{source.description}</p>

              {status.refreshError && (
                <Alert variant="note">
                  Couldn&apos;t refresh just now — showing the last saved copy. (
                  {status.refreshError})
                </Alert>
              )}
              {status.state === "not_configured" && NOT_CONFIGURED_NOTE[source.key] && (
                <p className="text-sm text-ink-500">{NOT_CONFIGURED_NOTE[source.key]}</p>
              )}

              <DescriptionList
                items={[
                  {
                    label: "Last updated",
                    value: status.lastUpdatedAt
                      ? formatStationTimestamp(status.lastUpdatedAt)
                      : "—",
                  },
                  { label: "Latest", value: status.latest },
                  { label: "Refreshes after", value: formatStaleAfter(source.staleAfterMs) },
                ]}
              />

              <div className="mt-auto flex flex-wrap items-center gap-3">
                <PrimaryLink href={source.href}>Open {source.label}</PrimaryLink>
                {source.key === "weather" && (
                  <form action={refreshWeatherAction}>
                    <input type="hidden" name="return_to" value="/log/sources" />
                    <Button type="submit" variant="secondary">
                      Refresh
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
