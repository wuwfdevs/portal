"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { actionError, actionOk, type ActionResult } from "@/lib/action-response";
import { uuidParam } from "@/lib/sourcework/route-input";
import { checkQuoteRange, wordsInRange } from "@/lib/sourcework/quotes";
import { suggestExcerptTitle } from "@/lib/transcription/excerpt-title";
import { buildTimedTokens } from "@/lib/transcription/selection";
import { embedPendingForRepresentation } from "@/lib/transcription/indexing";
import { getTranscriptForRepresentation } from "@/lib/transcription/projects";
import { projectPath, themePath, themeQuotesPath } from "@/lib/transcription/links";

// Writes behind the suggested-quotes screen (docs/sourcework-analysis-design.md §5.5).
// Called straight from client components, so they return a result instead of redirecting.
// Any tool member may decide on a suggestion — RLS is the boundary, these are the courtesy in
// front. Rejecting never deletes; accepting writes an ordinary excerpt.

function revalidateQuotes(projectId: string, themeId: string, sourceId: string) {
  revalidatePath(themeQuotesPath(projectId, themeId));
  revalidatePath(themePath(projectId, themeId));
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
    .select("id, project_id, theme_id, source_id, representation_id, status")
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

  const source = await supabase
    .from("sw_sources")
    .select("original_duration_ms")
    .eq("id", suggestion.source_id)
    .maybeSingle();
  if (source.error) {
    console.error("Could not read the quote's source:", source.error);
    return actionError("Couldn't accept that quote. Try again.");
  }

  const startMs = Math.round(input.startMs);
  const endMs = Math.round(input.endMs);
  const checked = checkQuoteRange({ startMs, endMs }, source.data?.original_duration_ms ?? null);
  if (!checked.ok) return actionError(checked.error);

  // The words come from the transcript as it stands now, so a line corrected since the model
  // read it is quoted as corrected.
  let text = "";
  if (suggestion.representation_id) {
    const transcript = await getTranscriptForRepresentation(suggestion.representation_id);
    text = wordsInRange(
      transcript.segments.map((segment) =>
        buildTimedTokens({
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.text,
          words: segment.words,
        }),
      ),
      { startMs, endMs },
    );
  }
  if (text.trim() === "") {
    return actionError("There are no words in that range. Trim it less, or cut it by hand.");
  }

  const accepted = await supabase.rpc("sw_accept_quote_suggestion", {
    p_suggestion_id: id,
    p_start_ms: startMs,
    p_end_ms: endMs,
    p_title: suggestExcerptTitle(text) || "Suggested quote",
    p_text: text,
  });
  if (accepted.error) {
    console.error("Could not accept the suggested quote:", accepted.error);
    return actionError("Couldn't accept that quote. Try again.");
  }
  if (!accepted.data) return actionError("Someone has already decided on this quote.");

  // As for a clip cut by hand: embedded at once so it is searchable immediately. Best effort.
  if (suggestion.representation_id) {
    await embedPendingForRepresentation(supabase, suggestion.representation_id);
  }
  revalidateQuotes(suggestion.project_id, suggestion.theme_id, suggestion.source_id);
  return actionOk({ excerptId: accepted.data });
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
    .select("project_id, theme_id, source_id");
  if (updated.error) {
    console.error("Could not reject the suggested quote:", updated.error);
    return actionError("Couldn't save that decision. Try again.");
  }
  const row = updated.data[0];
  if (!row) return actionError("Someone has already decided on this quote.");

  revalidateQuotes(row.project_id, row.theme_id, row.source_id);
  return actionOk();
}
