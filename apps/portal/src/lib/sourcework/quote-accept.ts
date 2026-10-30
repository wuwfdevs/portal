import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { actionError, actionOk, type ActionResult } from "@/lib/action-response";
import { checkQuoteRange, wordsInRange } from "./quotes";
import { proposeExcerptTitle } from "./excerpt-title-ai";
import { storeFullExcerptName } from "./excerpt-name";
import { buildTimedTokens } from "@/lib/transcription/selection";
import { getTranscriptForRepresentation } from "@/lib/transcription/projects";

// Writing a suggested clip as an excerpt, shared by accepting one (quote-actions.ts) and by the
// Review tab's accept-all (review-actions.ts). Not a Server Action file: it takes a Supabase client.

interface WaitingSuggestion {
  id: string;
  project_id: string;
  source_id: string;
  representation_id: string | null;
}

/**
 * Writes one suggestion as an excerpt for the given range: checks the range, derives the words
 * from the transcript as it stands now (so a line corrected since the model read it is quoted as
 * corrected), accepts through the RPC and names the excerpt. Revalidation and embedding are left to
 * the caller.
 */
export async function acceptSuggestionInRange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  suggestion: WaitingSuggestion,
  range: { startMs: number; endMs: number },
): Promise<ActionResult<{ excerptId: string }>> {
  const source = await supabase
    .from("sw_sources")
    .select("original_duration_ms")
    .eq("id", suggestion.source_id)
    .maybeSingle();
  if (source.error) {
    console.error("Could not read the quote's source:", source.error);
    return actionError("Couldn't accept that quote. Try again.");
  }

  const startMs = Math.round(range.startMs);
  const endMs = Math.round(range.endMs);
  const checked = checkQuoteRange({ startMs, endMs }, source.data?.original_duration_ms ?? null);
  if (!checked.ok) return actionError(checked.error);

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
    p_suggestion_id: suggestion.id,
    p_start_ms: startMs,
    p_end_ms: endMs,
    p_title: "Suggested quote",
    p_text: text,
  });
  if (accepted.error) {
    console.error("Could not accept the suggested quote:", accepted.error);
    return actionError("Couldn't accept that quote. Try again.");
  }
  if (!accepted.data) return actionError("Someone has already decided on this quote.");

  await storeFullExcerptName(supabase, {
    excerptId: accepted.data,
    projectId: suggestion.project_id,
    quote: (await proposeExcerptTitle(text)) || "Suggested quote",
  });
  return actionOk({ excerptId: accepted.data });
}
