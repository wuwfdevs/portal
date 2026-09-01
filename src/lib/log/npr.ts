import "server-only";

// Lazy-refresh orchestration for NPR CDS program-episodes — docs/log-design.md
// §6's "no job queue" architecture note: a read checks staleness and
// refetches inline when needed, rather than a background job keeping it
// current. A fetch failure never clears or blocks a previously cached
// episode; it just means this read returns what's still cached (if
// anything), flagged stale, with the error attached for the screen to show
// (§5.2, §22). Episode identity is (program, show_date) — see
// docs/log-design.md §5 on why a rundown is a dated document, not one
// undifferentiated "current" state per program.

import { getProgram, getNprEpisodeCache, type NprEpisodeCacheEntry } from "./queries";
import { fetchNprEpisode, isNprCdsConfigured } from "./providers/npr";
import { classifyNprAccess } from "./npr-access";
import { checkStaleness, NPR_STALE_THRESHOLD_MS } from "./staleness";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";

export type NprEpisodeResult =
  // The program has no npr_collection_id — no CDS request is ever attempted.
  | { kind: "unmapped" }
  // No NPR_CDS_TOKEN configured — no CDS request is ever attempted.
  | { kind: "not_configured" }
  // A refresh was attempted (no usable cache existed for this program+date)
  // and it failed — there is nothing to show yet, distinct from a confirmed
  // "no episode" result below.
  | { kind: "error"; message: string }
  // CDS was reached and confirmed no program-episode exists for this
  // program+date. Itself cacheable/stale, like a found episode.
  | { kind: "not_found"; retrievedAt: string; stale: boolean; refreshError: string | null }
  | {
      kind: "found";
      episodeId: string;
      nprEpisodeId: string;
      title: string | null;
      items: NprEpisodeCacheEntry["items"];
      retrievedAt: string;
      stale: boolean;
      refreshError: string | null;
    };

/**
 * Replaces this program+date's existing cached episode (if any) with the
 * freshly fetched one — the "replaced wholesale, not diffed" rule from
 * docs/log-design.md §5, scoped to one dated episode rather than a whole
 * program. The CDS fetch happens *before* any write, so a failed refresh
 * never touches — let alone destroys — a previously successful cache for
 * this same program+date.
 *
 * The actual delete+insert(+items) is one atomic database call
 * (log_replace_npr_episode_cache, 20260901120000_log_npr_episode_cache_
 * atomic.sql), not three separate ones — this used to be a delete, then a
 * separate insert, as independent round trips, leaving a real reader-
 * visible gap where this program+date had no cached episode at all. Two
 * clients polling the same live rundown (a host and a producer, say) could
 * cross the 15-minute staleness threshold within the same moment and both
 * call this concurrently, widening that window. The items read afterward
 * is a plain, safe follow-up read — by the time it runs, the RPC has
 * already committed a fully consistent episode + items.
 */
async function replaceEpisodeCache(
  programId: string,
  collectionId: number,
  showDateISO: string,
): Promise<NprEpisodeCacheEntry> {
  const fetched = await fetchNprEpisode(collectionId, showDateISO);
  const supabase = await createClient();

  const { data: episode, error } = await supabase.rpc("log_replace_npr_episode_cache", {
    p_program_id: programId,
    p_show_date: showDateISO,
    p_npr_collection_id: collectionId,
    p_status: fetched.status,
    p_npr_episode_id: fetched.status === "found" ? fetched.npr_episode_id : null,
    p_title: fetched.status === "found" ? fetched.title : null,
    p_raw: fetched.status === "found" ? fetched.raw : null,
    p_items:
      fetched.status === "found"
        ? fetched.items.map((item) => ({
            npr_item_id: item.npr_item_id,
            title: item.title,
            teaser: item.teaser,
            duration_seconds: item.duration_seconds,
            raw: item.raw,
          }))
        : null,
  });
  if (error) throw new Error(error.message);

  if (episode.status === "not_found") return { episode, items: [] };

  const items =
    unwrapRead(
      await supabase.from("log_npr_episode_items").select("*").eq("episode_id", episode.id).order("position"),
      "this program's NPR episode items",
    ) ?? [];

  return { episode, items };
}

/**
 * Lazy-refresh read for one program's episode on one show date. Checks the
 * program's NPR mapping and CDS configuration first — neither ever reaches
 * the network (see lib/log/npr-access.ts) — then returns the cached episode,
 * refetching first if it's stale. Never throws.
 */
export async function getNprEpisodeForProgramOnDate(
  programId: string,
  showDateISO: string,
): Promise<NprEpisodeResult> {
  const program = await getProgram(programId);
  const access = classifyNprAccess(program?.npr_collection_id ?? null, isNprCdsConfigured());
  if (access.kind !== "ready") return access;

  let cached = await getNprEpisodeCache(programId, showDateISO);
  const { isStale } = checkStaleness(
    cached?.episode.retrieved_at ?? null,
    NPR_STALE_THRESHOLD_MS,
    new Date().toISOString(),
  );

  let refreshError: string | null = null;
  if (isStale) {
    try {
      cached = await replaceEpisodeCache(programId, access.collectionId, showDateISO);
    } catch (error) {
      refreshError = error instanceof Error ? error.message : "Could not refresh the NPR episode.";
    }
  }

  if (!cached) return { kind: "error", message: refreshError ?? "No NPR episode has been retrieved yet." };

  if (cached.episode.status === "not_found") {
    return {
      kind: "not_found",
      retrievedAt: cached.episode.retrieved_at,
      stale: refreshError !== null,
      refreshError,
    };
  }

  return {
    kind: "found",
    episodeId: cached.episode.id,
    nprEpisodeId: cached.episode.npr_episode_id!,
    title: cached.episode.title,
    items: cached.items,
    retrievedAt: cached.episode.retrieved_at,
    stale: refreshError !== null,
    refreshError,
  };
}

/** Force refresh, bypassing the staleness check — the manual "Refresh" button's action. */
export async function refreshNprEpisodeForProgramOnDate(
  programId: string,
  showDateISO: string,
): Promise<{ error?: string }> {
  const program = await getProgram(programId);
  const access = classifyNprAccess(program?.npr_collection_id ?? null, isNprCdsConfigured());
  if (access.kind === "unmapped") return { error: "This program has no NPR CDS mapping." };
  if (access.kind === "not_configured") return { error: "NPR CDS access isn't configured yet." };

  try {
    await replaceEpisodeCache(programId, access.collectionId, showDateISO);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not refresh the NPR episode." };
  }
}
