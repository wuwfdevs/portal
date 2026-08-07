import "server-only";

// NPR integration for log_npr_rundown_cache (docs/log-design.md §5). The
// real feed WUWF will poll is an explicitly open question — both
// docs/broadcast-operations-strategy.md §7 ("What NPR API or station
// integration is actually available for rundowns...") and
// docs/log-design.md §7 flag it as unresolved. Rather than leaving NPR
// entirely unbuilt until that's answered, this follows the same "build
// behind a thin interface, mark it unverified" precedent
// lib/remote-interview/daily.ts set when this repo had no live Daily
// account either: a configurable feed URL, a generic JSON contract this
// module normalizes into log_npr_rundown_cache's shape, and a clear
// "not configured" outcome — never a crash — when no feed is set.
//
// NPR_RUNDOWNS_API_URL/NPR_RUNDOWNS_API_KEY are unset by default (see
// .env.example). Until WUWF's actual affiliate feed access and its real
// response shape are known, every caller (lib/log/npr.ts) must treat "not
// configured" as an ordinary, expected outcome — the same way Remote
// Interview's cloud backup or Sourcework's Mistral OCR fallback do for
// their own optional integrations.

import type { LogNprStatus } from "@/lib/database.types";

export interface NprSegment {
  segment_order: number;
  story_title: string;
  story_description: string | null;
  forward_promo_copy: string | null;
  status: LogNprStatus;
  advisory_text: string | null;
}

interface RawNprFeedSegment {
  order?: number;
  segment_order?: number;
  title?: string;
  story_title?: string;
  description?: string;
  story_description?: string;
  forward_promo?: string;
  forward_promo_copy?: string;
  status?: string;
  advisory?: string;
}

const VALID_STATUSES: LogNprStatus[] = ["draft", "edited", "revised", "withdrawn"];

function normalizeStatus(value: string | undefined): LogNprStatus {
  return VALID_STATUSES.includes(value as LogNprStatus) ? (value as LogNprStatus) : "draft";
}

/** Whether a feed URL is configured at all — callers use this to show a clear "not set up" state rather than attempting a fetch that can only fail. */
export function isNprFeedConfigured(): boolean {
  return Boolean(process.env.NPR_RUNDOWNS_API_URL);
}

/**
 * Fetches the current segment order for one program from the configured NPR
 * feed. Throws with a clear, user-facing message on any failure — including
 * "not configured" — for lib/log/npr.ts to catch and treat as a
 * stale-but-not-broken read, per the architecture note in docs/log-design.md
 * §6 ("a temporary API or network failure must not make the current rundown
 * unreadable").
 */
export async function fetchNprRundown(programId: string): Promise<NprSegment[]> {
  const feedUrl = process.env.NPR_RUNDOWNS_API_URL;
  if (!feedUrl) {
    throw new Error("The NPR rundown feed isn't configured yet (missing NPR_RUNDOWNS_API_URL).");
  }

  const url = new URL(feedUrl);
  url.searchParams.set("program_id", programId);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.NPR_RUNDOWNS_API_KEY) {
    headers.Authorization = `Bearer ${process.env.NPR_RUNDOWNS_API_KEY}`;
  }

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`The NPR rundown feed returned an error (${res.status}).`);
  }

  const body = (await res.json()) as { segments?: RawNprFeedSegment[] };
  const rawSegments = body.segments ?? [];

  return rawSegments
    .map((segment, index) => ({
      segment_order: segment.segment_order ?? segment.order ?? index + 1,
      story_title: segment.story_title ?? segment.title ?? "Untitled segment",
      story_description: segment.story_description ?? segment.description ?? null,
      forward_promo_copy: segment.forward_promo_copy ?? segment.forward_promo ?? null,
      status: normalizeStatus(segment.status),
      advisory_text: segment.advisory ?? null,
    }))
    .sort((a, b) => a.segment_order - b.segment_order);
}
