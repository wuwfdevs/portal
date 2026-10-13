"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { actionError, actionOk, type ActionResult } from "@/lib/action-response";
import { uuidParam } from "@/lib/sourcework/route-input";
import { checkQuoteRange, wordsInRange } from "@/lib/sourcework/quotes";
import { proposeExcerptTitle } from "@/lib/sourcework/excerpt-title-ai";
import { storeFullExcerptName } from "@/lib/sourcework/excerpt-name";
import { buildTimedTokens } from "@/lib/transcription/selection";
import { embedPendingForRepresentation } from "@/lib/transcription/indexing";
import { getTranscriptForRepresentation } from "@/lib/transcription/projects";
import { projectPath, themePath, themeQuotesPath } from "@/lib/transcription/links";

// Writes behind the suggested-quotes screen (docs/sourcework-analysis-design.md §5.5).
// Called straight from client components, so they return a result instead of redirecting.
// Any tool member may decide on a suggestion — RLS is the boundary, these are the courtesy in
// front. Rejecting never deletes; accepting writes an ordinary excerpt.

function revalidateQuotes(projectId: string, themeId: string | null, sourceId: string) {
  // A clip Analyze proposed belongs to a source, not a theme.
  if (themeId) {
    revalidatePath(themeQuotesPath(projectId, themeId));
    revalidatePath(themePath(projectId, themeId));
  }
  revalidatePath(projectPath(projectId, "excerpts"));
  revalidatePath(`/sourcework/sources/${sourceId}`);
}

interface WaitingSuggestion {
  id: string;
  project_id: string;
  theme_id: string | null;
  source_id: string;
  representation_id: string | null;
}

type Transcript = Awaited<ReturnType<typeof getTranscriptForRepresentation>>;

/**
 * Writes one suggestion as an excerpt for the given range: checks the range, derives the words
 * from the transcript as it stands now (so a line corrected since the model read it is quoted as
 * corrected), accepts through the RPC and names the excerpt. Shared by the one-card and the
 * accept-all paths; revalidation and embedding are left to the caller so a batch does them once.
 */
async function acceptSuggestionInRange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  suggestion: WaitingSuggestion,
  range: { startMs: number; endMs: number },
  transcripts: Map<string, Transcript> = new Map(),
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
    let transcript = transcripts.get(suggestion.representation_id);
    if (!transcript) {
      transcript = await getTranscriptForRepresentation(suggestion.representation_id);
      transcripts.set(suggestion.representation_id, transcript);
    }
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

  const result = await acceptSuggestionInRange(supabase, suggestion, input);
  if (!result.ok) return result;

  // As for a clip cut by hand: embedded at once so it is searchable immediately. Best effort.
  if (suggestion.representation_id) {
    await embedPendingForRepresentation(supabase, suggestion.representation_id);
  }
  revalidateQuotes(suggestion.project_id, suggestion.theme_id, suggestion.source_id);
  return result;
}

/** How many waiting quotes one accept-all handles; the rest stay for another click. */
const ACCEPT_ALL_QUOTES_LIMIT = 30;
const ACCEPT_ALL_CONCURRENCY = 3;

/**
 * Accepts the quotes still waiting on a theme, each at the cut the model suggested (trim a clip
 * first if it needs one). A quote that can't be accepted (its words are gone from the transcript,
 * or someone else decided it first) is skipped and counted, never fails the rest.
 */
export async function acceptSuggestedQuotes(input: {
  themeId: string;
}): Promise<ActionResult<{ accepted: number; skipped: number; remaining: number }>> {
  await assertSourceworkContext();
  const themeId = uuidParam(input.themeId);
  if (!themeId) return actionError("That theme doesn't exist.");

  const supabase = await createClient();
  const waiting = await supabase
    .from("sw_quote_suggestions")
    .select("id, project_id, theme_id, source_id, representation_id, start_ms, end_ms")
    .eq("theme_id", themeId)
    .eq("status", "suggested")
    .order("created_at")
    .limit(ACCEPT_ALL_QUOTES_LIMIT + 1);
  if (waiting.error) {
    console.error("Could not read the waiting quotes:", waiting.error);
    return actionError("Couldn't accept the quotes. Try again.");
  }
  const batch = waiting.data.slice(0, ACCEPT_ALL_QUOTES_LIMIT);
  const remaining = waiting.data.length - batch.length;
  if (batch.length === 0) return actionOk({ accepted: 0, skipped: 0, remaining: 0 });

  const transcripts = new Map<string, Transcript>();
  let accepted = 0;
  let skipped = 0;
  for (let index = 0; index < batch.length; index += ACCEPT_ALL_CONCURRENCY) {
    const results = await Promise.all(
      batch
        .slice(index, index + ACCEPT_ALL_CONCURRENCY)
        .map((suggestion) =>
          acceptSuggestionInRange(
            supabase,
            suggestion,
            { startMs: suggestion.start_ms, endMs: suggestion.end_ms },
            transcripts,
          ),
        ),
    );
    for (const result of results) {
      if (result.ok) accepted += 1;
      else skipped += 1;
    }
  }

  // Embedded once per recording rather than once per quote. Best effort.
  const representations = new Set(
    batch.map((suggestion) => suggestion.representation_id).filter((id): id is string => !!id),
  );
  for (const representationId of representations) {
    await embedPendingForRepresentation(supabase, representationId);
  }
  const first = batch[0]!;
  revalidateQuotes(first.project_id, themeId, first.source_id);
  for (const sourceId of new Set(batch.map((suggestion) => suggestion.source_id))) {
    revalidatePath(`/sourcework/sources/${sourceId}`);
  }
  return actionOk({ accepted, skipped, remaining });
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
