"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { actionError, actionOk, type ActionResult } from "@/lib/action-response";
import { uuidParam } from "@/lib/sourcework/route-input";
import { acceptSuggestionInRange } from "@/lib/sourcework/quote-accept";
import { embedPendingForRepresentation } from "@/lib/transcription/indexing";
import { projectPath } from "@/lib/transcription/links";

// Writes behind a source's clips to review (docs/sourcework-analysis-design.md §20, §5.5).
// Called straight from client components, so they return a result instead of redirecting.
// Any tool member may decide on a suggestion — RLS is the boundary, these are the courtesy in
// front. Rejecting never deletes; accepting writes an ordinary excerpt.

function revalidateQuotes(projectId: string, sourceId: string) {
  revalidatePath(projectPath(projectId, "excerpts"));
  revalidatePath(`/sourcework/sources/${sourceId}`);
}

/**
 * Accepts a suggested quote as an excerpt on its source. The clip may have been trimmed, so
 * the range arrives from the client and is checked; the words are derived here from the
 * transcript for that range (never taken from the client or the model), and the title is the
 * start of them, as for any excerpt cut by hand. Returns the new excerpt's id.
 */
export async function acceptQuote(input: {
  suggestionId: string;
  startMs: number;
  endMs: number;
}): Promise<ActionResult<{ excerptId: string }>> {
  await assertSourceworkContext();
  const id = uuidParam(input.suggestionId);
  if (!id) return actionError("That suggestion doesn't exist.");

  const supabase = await createClient();
  const found = await supabase
    .from("sw_quote_suggestions")
    .select("id, project_id, source_id, representation_id, status")
    .eq("id", id)
    .maybeSingle();
  if (found.error) {
    console.error("Could not read the suggested quote:", found.error);
    return actionError("Couldn't accept that quote. Try again.");
  }
  const suggestion = found.data;
  if (!suggestion) return actionError("That suggestion doesn't exist any more.");
  if (suggestion.status !== "suggested") {
    return actionError("Someone has already decided on this quote.");
  }

  const result = await acceptSuggestionInRange(supabase, suggestion, input);
  if (!result.ok) return result;

  // As for a clip cut by hand: embedded at once so it is searchable immediately. Best effort.
  if (suggestion.representation_id) {
    await embedPendingForRepresentation(supabase, suggestion.representation_id);
  }
  revalidateQuotes(suggestion.project_id, suggestion.source_id);
  return result;
}

/** Hides a suggestion. It stays on file, so a later run does not propose that stretch again. */
export async function rejectQuote(input: { suggestionId: string }): Promise<ActionResult> {
  const { profile } = await assertSourceworkContext();
  const id = uuidParam(input.suggestionId);
  if (!id) return actionError("That suggestion doesn't exist.");

  const supabase = await createClient();
  const updated = await supabase
    .from("sw_quote_suggestions")
    .update({
      status: "rejected",
      decided_by: profile.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "suggested")
    .select("project_id, source_id");
  if (updated.error) {
    console.error("Could not reject the suggested quote:", updated.error);
    return actionError("Couldn't save that decision. Try again.");
  }
  const row = updated.data[0];
  if (!row) return actionError("Someone has already decided on this quote.");

  revalidateQuotes(row.project_id, row.source_id);
  return actionOk();
}
