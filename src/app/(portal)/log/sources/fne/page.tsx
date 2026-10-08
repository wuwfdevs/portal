import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PrimaryLink, TextLink } from "@/components/ui/primary-link";
import { CardHeader } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { buildFneLibraryHandoffPath } from "@/lib/log/fne-handoff";
import { getFneFeedUrl, getFneStories } from "@/lib/log/fne";
import { FNE_KIND_LABELS, type FneItem } from "@/lib/log/providers/fne-response";
import { formatStationTimestamp } from "@/lib/log/timezone";
import { LogPoller } from "../../log-poller";
import { SourceHeader } from "../source-header";

// The feed is allowed to be 15 minutes old (lib/log/staleness.ts); this only
// needs to re-run that check often enough to notice — see log-poller.tsx.
const POLL_INTERVAL_MS = 5 * 60_000;

function Version({ item, showKind }: { item: FneItem; showKind: boolean }) {
  return (
    <li className="flex flex-col gap-3 border-t border-line px-5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {showKind && <Badge variant="accent">{FNE_KIND_LABELS[item.kind]}</Badge>}
        {item.holdNote && <Badge variant="warning">{item.holdNote}</Badge>}
        <span className="text-ink-500">{formatStationTimestamp(item.publishedAt)}</span>
        <span className="ml-auto flex items-center gap-3">
          <TextLink href={item.link} target="_blank" rel="noreferrer">
            Open on PRX
          </TextLink>
          <PrimaryLink href={buildFneLibraryHandoffPath(item)}>Add to library</PrimaryLink>
        </span>
      </div>

      {item.description && (
        <p className="max-w-prose whitespace-pre-wrap text-sm text-ink-700">{item.description}</p>
      )}

      {item.audioUrl ? (
        <audio controls preload="none" src={item.audioUrl} className="h-9 w-full max-w-md">
          <track kind="captions" />
        </audio>
      ) : (
        <p className="text-sm text-ink-500">No audio attached.</p>
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
        Stories other Florida stations share through PRX, from the last 24 hours, newest first. The
        description is often only a summary; the full script can be on the story&apos;s PRX page.
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
              <CardHeader>
                <h2>{story.title}</h2>
              </CardHeader>
              <ul>
                {story.versions.map((item) => (
                  <Version
                    key={item.guid}
                    item={item}
                    showKind={item.kind !== "other" || story.versions.length > 1}
                  />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
