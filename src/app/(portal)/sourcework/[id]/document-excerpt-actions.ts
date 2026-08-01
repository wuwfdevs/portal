"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { embedPendingForRepresentation } from "@/lib/transcription/indexing";
import { listProjectIdsForSource } from "@/lib/transcription/projects";

// Document excerpt creation/deletion — the document-locator counterpart to
// clip-actions.ts. Same shared-workspace trust model: any tool member can
// create or remove any document excerpt for a source they have access to.
// See docs/sourcework-design.md §8.7.

async function revalidateSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceId: string,
) {
  revalidatePath(`/sourcework/sources/${sourceId}`);
  revalidatePath("/sourcework");
  const projectIds = await listProjectIdsForSource(supabase, sourceId);
  for (const projectId of projectIds) revalidatePath(`/sourcework/${projectId}`);
}

export interface CreateDocumentExcerptLocation {
  pageNumber: number;
  blockId: string | null;
  startOffset: number | null;
  endOffset: number | null;
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
}

/**
 * Creates a document excerpt spanning one or more ordered locations. Inserts
 * the excerpt row and its locations in sequence — there's no cross-table
 * transaction available here, so a location-insert failure removes the
 * excerpt row rather than leaving one with no locations (same best-effort
 * cleanup pattern createProjectWithSource uses).
 */
export async function createDocumentExcerpt(input: {
  sourceId: string;
  representationId: string | null;
  title: string;
  excerptText: string;
  locations: CreateDocumentExcerptLocation[];
}): Promise<{ id: string } | { error: string }> {
  const { profile } = await assertToolAccess("transcription");
  const title = input.title.trim();
  if (!title) return { error: "Give the excerpt a title." };
  if (input.locations.length === 0) return { error: "Select some text to save as an excerpt." };

  const supabase = await createClient();

  const { data: excerpt, error: excerptError } = await supabase
    .from("sw_source_excerpts")
    .insert({
      source_id: input.sourceId,
      representation_id: input.representationId,
      title,
      locator_kind: "document",
      excerpt_text: input.excerptText.trim(),
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (excerptError || !excerpt) return { error: "Could not create the excerpt. Please try again." };

  const { error: locationError } = await supabase.from("sw_excerpt_document_locations").insert(
    input.locations.map((location, sequence) => ({
      excerpt_id: excerpt.id,
      sequence,
      page_number: location.pageNumber,
      block_id: location.blockId,
      start_offset: location.startOffset,
      end_offset: location.endOffset,
      bbox: location.bbox,
    })),
  );
  if (locationError) {
    await supabase.from("sw_source_excerpts").delete().eq("id", excerpt.id);
    return { error: "Could not save the excerpt's location. Please try again." };
  }

  if (input.representationId) {
    await embedPendingForRepresentation(supabase, input.representationId);
  }
  await revalidateSource(supabase, input.sourceId);
  return { id: excerpt.id };
}

export async function deleteDocumentExcerpt(excerptId: string): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { data: excerpt } = await supabase
    .from("sw_source_excerpts")
    .select("id, source_id")
    .eq("id", excerptId)
    .maybeSingle();
  if (!excerpt) return { error: "That excerpt no longer exists." };

  const { error } = await supabase.from("sw_source_excerpts").delete().eq("id", excerptId);
  if (error) return { error: "Could not delete the excerpt." };

  await revalidateSource(supabase, excerpt.source_id);
  return {};
}
