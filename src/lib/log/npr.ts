import "server-only";

// Lazy-refresh orchestration for the NPR rundown cache — docs/log-design.md
// §6's "no job queue" architecture note: a read checks staleness and
// refetches inline when needed, rather than a background job keeping it
// current. A fetch failure never clears or blocks the existing display; it
// just means this read returns what's still cached, flagged stale, with the
// error attached for the screen to show (§5.2, §22).

import { createClient } from "@/lib/supabase/server";
import { listNprRundownForProgram, type LogNprRundownCacheRow } from "./queries";
import { fetchNprRundown } from "./providers/npr";
import { checkStaleness, NPR_STALE_THRESHOLD_MS } from "./staleness";

export interface NprRundownResult {
  segments: LogNprRundownCacheRow[];
  retrievedAt: string | null;
  stale: boolean;
  refreshError: string | null;
}

/** Deletes a program's existing cached rows and inserts a fresh set — the "replaced wholesale, not diffed" rule from docs/log-design.md §5. */
async function replaceNprRundown(programId: string): Promise<LogNprRundownCacheRow[]> {
  const fetched = await fetchNprRundown(programId);
  const supabase = await createClient();

  const { error: deleteError } = await supabase
    .from("log_npr_rundown_cache")
    .delete()
    .eq("program_id", programId);
  if (deleteError) throw new Error(deleteError.message);

  if (fetched.length === 0) return [];

  const retrievedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("log_npr_rundown_cache")
    .insert(fetched.map((segment) => ({ ...segment, program_id: programId, retrieved_at: retrievedAt })))
    .select("*")
    .order("segment_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Lazy-refresh read: returns the cached rundown, refetching first if it's stale. Never throws — a refetch failure is reported via refreshError, not an exception. */
export async function getNprRundownForProgram(programId: string): Promise<NprRundownResult> {
  let segments = await listNprRundownForProgram(programId);
  const latestRetrievedAt = segments[0]?.retrieved_at ?? null;
  const { isStale } = checkStaleness(latestRetrievedAt, NPR_STALE_THRESHOLD_MS, new Date().toISOString());

  let refreshError: string | null = null;
  if (isStale) {
    try {
      segments = await replaceNprRundown(programId);
    } catch (error) {
      refreshError = error instanceof Error ? error.message : "Could not refresh the NPR rundown.";
    }
  }

  return {
    segments,
    retrievedAt: segments[0]?.retrieved_at ?? null,
    stale: refreshError !== null,
    refreshError,
  };
}

/** Force refresh, bypassing the staleness check — the manual "Refresh" button's action. */
export async function refreshNprRundownForProgram(programId: string): Promise<{ error?: string }> {
  try {
    await replaceNprRundown(programId);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not refresh the NPR rundown." };
  }
}
