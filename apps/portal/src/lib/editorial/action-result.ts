import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";

// Every editorial write funnels its failure through here. A write that fails
// and then redirects as though it succeeded is indistinguishable from a broken
// screen — which is exactly how an unapplied migration once looked like "the
// settings aren't configurable". Screens render the message from ?error=.

/**
 * Abandon the action and send the user back to `path` with a message. `path`
 * may already carry a query string (an inline create card's `?new=1`), in
 * which case the error is appended to it.
 */
export function failWith(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

/**
 * No-op when the write succeeded; otherwise logs the Postgres error and bounces
 * back to `path`. `summary` should read as a sentence on its own, e.g.
 * "Could not add the field".
 */
export function failIfError(error: PostgrestError | null, path: string, summary: string): void {
  if (!error) return;
  console.error(`${summary}:`, error);
  failWith(path, `${summary}: ${error.message}`);
}

/**
 * Runs a `.delete()` that was given `.select("id")` and fails when it removed
 * nothing. A delete refused by RLS, or aimed at an id that is already gone,
 * is not an error to Postgres — it matches zero rows — so without this check
 * the action redirects as though the row went. Usage:
 *
 *   await deleteOrFail(supabase.from("t").delete().eq("id", id).select("id"), path, "Could not delete the thing");
 */
export async function deleteOrFail(
  query: PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }>,
  path: string,
  summary: string,
  notFound = "That no longer exists, or you don't have permission to remove it.",
): Promise<void> {
  const { data, error } = await query;
  failIfError(error, path, summary);
  if (!data || data.length === 0) failWith(path, notFound);
}
