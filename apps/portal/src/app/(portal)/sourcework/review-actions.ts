"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { actionError, actionOk, type ActionResult } from "@/lib/action-response";
import { uuidParam } from "@/lib/sourcework/route-input";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { acceptSuggestionInRange } from "@/lib/sourcework/quote-accept";
import { embedPendingForRepresentation } from "@/lib/transcription/indexing";
import { projectPath } from "@/lib/transcription/links";

// Writes and reads behind the project's Review tab (docs/sourcework-analysis-design.md §25).
// Accepting findings in bulk is `acceptSuggestedDataPoints` (research-actions.ts); the clips'
// counterpart and the audio each card plays are here.

/** A short-lived URL for a source's recording, so a card on the Review tab can play its passage. */
export async function signReviewMedia(input: {
  sourceId: string;
}): Promise<ActionResult<{ url: string }>> {
  await assertSourceworkContext();
  const sourceId = uuidParam(input.sourceId);
  if (!sourceId) return actionError("That source doesn't exist.");
  const supabase = await createClient();
  const found = await supabase
    .from("sw_sources")
    .select("original_storage_path, kind")
    .eq("id", sourceId)
    .maybeSingle();
  if (found.error) {
    console.error("Could not read the source to play:", found.error);
    return actionError("Couldn't load the recording. Try again.");
  }
  if (!found.data?.original_storage_path || found.data.kind === "document") {
    return actionError("This source has no recording to play.");
  }
  const url = await getSignedMediaUrl(found.data.original_storage_path);
  if (!url) return actionError("Couldn't load the recording. Try again.");
  return actionOk({ url });
}

/**
 * Accepts every clip still waiting in the project as an excerpt, each at the range Analyze proposed.
 * One at a time: each reads its transcript and names itself. A clip that cannot be accepted (no words
 * in range, decided meanwhile) is counted and left waiting rather than stopping the rest.
 */
export async function acceptAllSuggestedClips(input: {
  projectId: string;
  sourceIds: string[];
}): Promise<ActionResult<{ accepted: number; skipped: number }>> {
  await assertSourceworkContext();
  const projectId = uuidParam(input.projectId);
  if (!projectId) return actionError("That project doesn't exist.");
  const current = new Set(input.sourceIds.map((id) => uuidParam(id)).filter(Boolean));

  const supabase = await createClient();
  const waiting = await supabase
    .from("sw_quote_suggestions")
    .select("id, project_id, source_id, representation_id, start_ms, end_ms")
    .eq("project_id", projectId)
    .eq("status", "suggested")
    .order("start_ms");
  if (waiting.error) {
    console.error("Could not read the waiting clips:", waiting.error);
    return actionError("Couldn't accept the clips. Try again.");
  }

  let accepted = 0;
  let skipped = 0;
  const representations = new Set<string>();
  for (const clip of waiting.data) {
    if (!current.has(clip.source_id)) continue;
    const result = await acceptSuggestionInRange(supabase, clip, {
      startMs: clip.start_ms,
      endMs: clip.end_ms,
    });
    if (result.ok) {
      accepted += 1;
      if (clip.representation_id) representations.add(clip.representation_id);
    } else skipped += 1;
  }
  // As for a clip cut by hand: searchable at once. Best effort.
  for (const representationId of representations) {
    await embedPendingForRepresentation(supabase, representationId);
  }

  revalidatePath(projectPath(projectId));
  revalidatePath(projectPath(projectId, "review"));
  revalidatePath(projectPath(projectId, "excerpts"));
  return actionOk({ accepted, skipped });
}
