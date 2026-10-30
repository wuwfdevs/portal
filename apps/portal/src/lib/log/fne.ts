import "server-only";

// Florida News Exchange (PRX Networks) — a public RSS feed of stories member
// stations share. Read lazily like NPR and weather (docs/log-design.md §6: no
// job queue): the first read after the copy is FNE_STALE_THRESHOLD_MS old
// refetches inline, and a failed refetch keeps serving the last good copy,
// flagged stale, with the error attached.
//
// The copy is kept in memory per server instance, not in the database: the
// feed is a rolling window of recent stories, nothing in a rundown points at it
// yet, and the audio links inside it are signed and expire after an hour, so a
// longer-lived copy would only hold dead links. A new instance simply refetches.

import { checkStaleness, FNE_STALE_THRESHOLD_MS } from "./staleness";
import {
  groupFneStories,
  parseFneFeed,
  type FneItem,
  type FneStory,
  withinLastHours,
} from "./providers/fne-response";

export const DEFAULT_FNE_FEED_URL = "https://networks.prx.org/florida-news-exchange/items/feed.rss";
const FETCH_TIMEOUT_MS = 10_000;

export function getFneFeedUrl(): string {
  return process.env.FNE_FEED_URL?.trim() || DEFAULT_FNE_FEED_URL;
}

interface Cached {
  url: string;
  items: FneItem[];
  fetchedAt: string;
}

let cached: Cached | null = null;

export interface FneResult {
  stories: FneStory[];
  itemCount: number;
  /** When the feed was last read successfully, or null if it never has been. */
  fetchedAt: string | null;
  stale: boolean;
  /** Why the refresh on this read failed, if it did. */
  refreshError: string | null;
}

async function fetchItems(url: string, timeoutMs: number): Promise<FneItem[]> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!response.ok) throw new Error(`PRX answered ${response.status}`);
  const items = parseFneFeed(await response.text());
  if (items.length === 0) throw new Error("The feed had no readable stories");
  return items;
}

/**
 * `timeoutMs` is how long a refresh may hold up the caller. The Sources page
 * can afford the default; the rundown sidebar passes a short one so a slow PRX
 * never delays a live screen (it falls back to the last copy, or nothing).
 */
export async function getFneStories(
  now: Date = new Date(),
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<FneResult> {
  const url = getFneFeedUrl();
  const usable = cached && cached.url === url ? cached : null;

  if (
    usable &&
    !checkStaleness(usable.fetchedAt, FNE_STALE_THRESHOLD_MS, now.toISOString()).isStale
  ) {
    return result(usable, false, null);
  }

  try {
    const items = await fetchItems(url, timeoutMs);
    cached = { url, items, fetchedAt: now.toISOString() };
    return result(cached, false, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The feed could not be read";
    if (usable) return result(usable, true, message);
    return { stories: [], itemCount: 0, fetchedAt: null, stale: true, refreshError: message };
  }
}

function result(copy: Cached, stale: boolean, refreshError: string | null): FneResult {
  // Only the last day is shown — older stories are no longer news to air.
  const recent = withinLastHours(copy.items, new Date());
  return {
    stories: groupFneStories(recent),
    itemCount: recent.length,
    fetchedAt: copy.fetchedAt,
    stale,
    refreshError,
  };
}
