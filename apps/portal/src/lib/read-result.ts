import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Reads are not allowed to fail quietly. A query that errors and falls back to
 * an empty array renders exactly like a healthy empty state, so a real outage
 * (RLS misconfiguration, a table that doesn't exist yet) shows up as "the tool
 * has no data" rather than as a problem. Throw instead and let the route's
 * error boundary say what happened.
 *
 * Lives at the top of lib/ rather than inside one tool's folder because both
 * Editorial Planning and the Transcription Workspace read through it.
 */
export function unwrapRead<T>(
  // T is inferred straight off `data`, which already carries the null from
  // Supabase's failure branch — so the return stays `Row | null` / `Row[] | null`.
  result: { data: T; error: PostgrestError | null },
  what: string,
): T {
  if (result.error) {
    console.error(`Read failed (${what}):`, result.error);
    throw new Error(`Could not load ${what}: ${result.error.message}`);
  }
  return result.data;
}
