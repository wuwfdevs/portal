import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Runs a write whose failure the caller deliberately does not act on — a
 * status flip on an already-failing path, a cleanup after a failure already
 * being reported — and logs the Postgres error instead of dropping it, so a
 * real outage still leaves a trace. Returns whether the write succeeded.
 * Anything the caller *does* depend on must destructure `error` and handle it.
 */
export async function bestEffort(
  query: PromiseLike<{ error: PostgrestError | null }>,
  what: string,
): Promise<boolean> {
  const { error } = await query;
  if (error) {
    console.error(`${what}:`, error);
    return false;
  }
  return true;
}
