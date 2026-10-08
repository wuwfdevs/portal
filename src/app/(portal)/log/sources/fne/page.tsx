import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getFneFeedUrl, getFneStories } from "@/lib/log/fne";
import { FNE_KIND_LABELS, type FneItem } from "@/lib/log/providers/fne-response";
import { formatStationTimestamp } from "@/lib/log/timezone";
import { LogPoller } from "../../log-poller";
import { SourceHeader } from "../source-header";

// The feed is allowed to be 15 minutes old (lib/log/staleness.ts); this only
// needs to re-run that check often enough to notice — see log-poller.tsx.
const POLL_INTERVAL_MS = 5 * 60_000;

function formatSize(bytes: number): string {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.round(bytes / 1000)} KB`;
}

function Version({ item }: { item: FneItem }) {
  return (
    <li className="flex flex-col gap-2 border-t border-line px-5 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="accent">{FNE_KIND_LABELS[item.kind]}</Badge>
        {item.holdNote && <Badge variant="warning">{item.holdNote}</Badge>}
        <span className="text-ink-500">{formatStationTimestamp(item.publishedAt)}</span>
        {item.audioBytes !== null && (
          <span className="text-ink-500">· {formatSize(item.audioBytes)}</span>
        )}
        <a
          href={item.link}
          target="_blank"
          rel="noreferrer"
          className="ml-auto font-semibold text-brand-link"
        >
          Open on PRX
        </a>
      </div>

      {item.audioUrl ? (
        <div className="flex flex-wrap items-center gap-3">
          <audio controls preload="none" src={item.audioUrl} className="h-9 w-full max-w-md" />
          <a
            href={item.audioUrl}
            download
            className="text-sm font-semibold text-brand-link"
            rel="noreferrer"
          >
            Download
          </a>
        </div>
      ) : (
        <p className="text-sm text-ink-500">No audio attached.</p>
      )}

      {item.description && (
        <details className="text-sm text-ink-700">
          <summary className="cursor-pointer font-semibold text-ink-900">Copy</summary>
          <p className="mt-2 max-w-prose whitespace-pre-wrap">{item.description}</p>
        </details>
      )}
    </li>
  );
}

export default async function FloridaNewsExchangePage() {
  const { stories, fetchedAt, stale, refreshError } = await getFneStories();

  return (
    <div className="max-w-3xl">
      <LogPoller intervalMs={POLL_INTERVAL_MS} />
      <SourceHeader title="Florida News Exchange" />

      <p className="mb-4 text-sm text-ink-500">
        Stories other Florida stations share through PRX, newest first. A wrap and its cut are
        listed together. Check a story&apos;s hold note and station tags in its copy before it airs.
      </p>

      {refreshError && (
        <Alert className="mb-4" variant="note">
          {fetchedAt
            ? `Couldn't refresh just now — showing the copy from ${formatStationTimestamp(fetchedAt)}. `
            : "Couldn't read the feed. "}
          ({refreshError}) The feed is at{" "}
          <a href={getFneFeedUrl()} className="font-semibold text-brand-link">
            PRX
          </a>
          .
        </Alert>
      )}
      {!refreshError && stale && fetchedAt && (
        <p className="mb-4 text-sm text-ink-500">Last read {formatStationTimestamp(fetchedAt)}.</p>
      )}

      {stories.length === 0 ? (
        !refreshError && <EmptyState>The feed has no stories right now.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {stories.map((story) => (
            <Card key={story.versions[0]!.guid} role="region" aria-label={story.title}>
              <h2 className="px-5 pt-4 text-base font-bold text-ink-900">{story.title}</h2>
              <ul className="mt-2">
                {story.versions.map((item) => (
                  <Version key={item.guid} item={item} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
