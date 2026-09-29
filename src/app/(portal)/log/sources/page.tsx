import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PrimaryLink } from "@/components/ui/primary-link";
import {
  DATA_SOURCES,
  DATA_SOURCE_STATE_LABELS,
  formatStaleAfter,
  type DataSourceState,
} from "@/lib/log/data-sources";
import { loadDataSourceStatuses } from "@/lib/log/data-source-status";
import { formatStationTimestamp } from "@/lib/log/timezone";
import { refreshWeatherAction } from "../weather-actions";
import { LogPoller } from "../log-poller";

// Weather's own page polls at this rate for the same reason — see log-poller.tsx.
const POLL_INTERVAL_MS = 5 * 60_000;

const STATE_BADGE: Record<DataSourceState, BadgeVariant> = {
  fresh: "success",
  stale: "warning",
  never_fetched: "muted",
  not_configured: "neutral",
};

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

      <div className="grid max-w-4xl grid-cols-1 gap-5 md:grid-cols-2">
        {DATA_SOURCES.map((source) => {
          const status = statuses[source.key];
          return (
            <section
              key={source.key}
              aria-labelledby={`source-${source.key}`}
              className="flex flex-col gap-4 rounded border border-line bg-white p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 id={`source-${source.key}`} className="text-base font-bold text-ink-900">
                  <Link href={source.href} className="hover:text-brand-link">
                    {source.label}
                  </Link>
                </h2>
                <Badge variant={STATE_BADGE[status.state]}>
                  {DATA_SOURCE_STATE_LABELS[status.state]}
                </Badge>
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

              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-ink-400">Last updated</dt>
                <dd className="text-ink-900">
                  {status.lastUpdatedAt ? formatStationTimestamp(status.lastUpdatedAt) : "—"}
                </dd>
                <dt className="text-ink-400">Latest</dt>
                <dd className="text-ink-900">{status.latest ?? "—"}</dd>
                <dt className="text-ink-400">Refreshes after</dt>
                <dd className="text-ink-900">{formatStaleAfter(source.staleAfterMs)}</dd>
              </dl>

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
            </section>
          );
        })}
      </div>
    </div>
  );
}
