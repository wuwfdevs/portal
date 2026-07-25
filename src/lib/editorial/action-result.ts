import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";

// Every editorial write funnels its failure through here. A write that fails
// and then redirects as though it succeeded is indistinguishable from a broken
// screen — which is exactly how an unapplied migration once looked like "the
// settings aren't configurable". Screens render the message from ?error=.

/** Abandon the action and send the user back to `path` with a message. */
export function failWith(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
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
