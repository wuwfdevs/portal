import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PublicQueryPayload } from "@/lib/database.types";

/**
 * The public view of a query: read server-side, in the route's Server
 * Component, before the participant has done anything at all.
 *
 * This is the one participant-facing read that belongs on the server rather
 * than in participant-client.ts: `al_public_query` is callable by `anon` and
 * needs no session, so it carries none of the cookie/session problem the rest
 * of this flow had (see public-client.ts's comment for the full story — a
 * cookie set inside this route's cross-origin iframe embed does not reliably
 * survive the round trip back to the server, which is why every function that
 * *does* need a session moved to participant-client.ts, called directly from
 * the browser). Doing this one server-side instead of client-side is what
 * lets the page render its title, intro, and questions before any JS has run —
 * meaningful for a page whose first job is to be read, not just clicked.
 *
 * Returns null for a draft exactly as it does for a public id that doesn't
 * exist — a draft link must not be distinguishable from a wrong one.
 */
export async function getPublicQuery(publicId: string): Promise<PublicQueryPayload | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("al_public_query", { p_public_id: publicId });

  if (error) {
    console.error("al_public_query failed:", error);
    throw new Error(`Could not load this page: ${error.message}`);
  }
  return data;
}
