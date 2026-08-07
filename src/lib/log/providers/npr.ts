import "server-only";

// NPR integration for log_npr_episodes/log_npr_episode_items
// (docs/log-design.md §5), against NPR's real Content Distribution Service
// (CDS) — see CLAUDE.md's "Log: NPR integration corrected to the real CDS
// model" note for why this replaced an earlier hypothetical "rundown feed"
// prototype. CDS-specific request/response shape is concentrated in this
// file and npr-response.ts; nothing above the orchestration layer
// (lib/log/npr.ts) sees raw CDS JSON.
//
// This repo has no live CDS token to verify against yet (see the note
// above) — the request shape below is built from NPR-supplied API context,
// not independently verified against a real account, the same "unverified
// until credentials exist" posture lib/remote-interview/daily.ts shipped
// with before this repo had a live Daily account.

import { parseCdsProgramEpisodeResponse, type NprEpisodeFetchResult } from "./npr-response";

const DEFAULT_CDS_API_BASE = "https://content.api.npr.org/v1";

function token(): string {
  const value = process.env.NPR_CDS_TOKEN;
  if (!value) throw new Error("NPR CDS access isn't configured yet (missing NPR_CDS_TOKEN).");
  return value;
}

/** Whether an NPR CDS token is configured at all — callers check this (via lib/log/npr-access.ts) before ever attempting a fetch, so "not configured" is a state, not a caught error. */
export function isNprCdsConfigured(): boolean {
  return Boolean(process.env.NPR_CDS_TOKEN);
}

/**
 * Fetches the dated program-episode document for one NPR collection, with
 * its ordered story items transcluded. Throws with a clear message on any
 * hard failure (network error, non-2xx, unrecognized response shape) — for
 * lib/log/npr.ts to catch and fall back to the last cached episode for this
 * exact program+date, per docs/log-design.md §6 ("a temporary API or
 * network failure must not make the current rundown unreadable"). A
 * *recognized* response with no matching episode returns
 * `{ status: "not_found" }` instead of throwing — that's a legitimate,
 * cacheable outcome (see npr-response.ts).
 */
export async function fetchNprEpisode(
  npr_collection_id: number,
  showDateISO: string,
): Promise<NprEpisodeFetchResult> {
  const base = process.env.NPR_CDS_API_BASE || DEFAULT_CDS_API_BASE;
  const url = new URL(`${base}/documents`);
  url.searchParams.set("collectionIds", String(npr_collection_id));
  url.searchParams.set("profileIds", "program-episode");
  url.searchParams.set("showDates", showDateISO);
  url.searchParams.set("transclude", "items");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`NPR CDS returned an error (${res.status}).`);
  }

  const body: unknown = await res.json();
  return parseCdsProgramEpisodeResponse(body);
}
