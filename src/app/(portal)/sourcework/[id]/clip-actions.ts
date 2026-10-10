"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { speakerLabels } from "@/lib/sourcework/piece-queries";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { renderClipWav } from "@/lib/transcription/export";
import { embedPendingForRepresentation } from "@/lib/transcription/indexing";
import {
  getPrimaryProjectIdForSource,
  listProjectIdsForSource,
} from "@/lib/transcription/projects";
import {
  MAX_CLIP_DURATION_MS,
  TRANSCRIPTION_MEDIA_BUCKET,
  buildExcerptExportFilename,
  excerptExportObjectPath,
} from "@/lib/transcription/media";

// Clip (source excerpt) creation, trim, and export — see
// docs/transcription-workspace-design.md Phase 4 and docs/sourcework-design.md.
// Same shared-workspace trust model as transcript correction: any tool member
// can create, adjust, or export any clip for a source they have access to.

const MIN_CLIP_DURATION_MS = 500;

/**
 * Revalidates every screen a source-scoped write (an excerpt, here) can show
 * up on: the Source Detail page itself, the cross-project library/search
 * list, and every project that references this source — not just the one
 * a caller happened to be looking at. A source can be attached to more than
 * one project, and each one shows the same clip list via
 * listExcerptsForSource, so revalidating only "the" project (a guess at
 * which one) left the others stale.
 */
async function revalidateSource(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceId: string,
) {
  revalidatePath(`/sourcework/sources/${sourceId}`);
  revalidatePath("/sourcework");
  const projectIds = await listProjectIdsForSource(supabase, sourceId);
  for (const projectId of projectIds) revalidatePath(`/sourcework/${projectId}`);
}

export async function createClip(input: {
  /** Which source this excerpt belongs to — the active pill, not necessarily a project's primary one. */
  sourceId: string;
  representationId: string | null;
  startMs: number;
  endMs: number;
  title: string;
  excerpt: string;
}): Promise<{ id: string } | { error: string }> {
  const { profile } = await assertToolAccess("transcription");
  const title = input.title.trim();

  if (!title) return { error: "Give the excerpt a title." };
  if (input.endMs - input.startMs < MIN_CLIP_DURATION_MS) {
    return { error: "That selection is too short to make an excerpt." };
  }
  if (input.endMs - input.startMs > MAX_CLIP_DURATION_MS) {
    return { error: "That selection is too long for a single excerpt — try a shorter one." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sw_source_excerpts")
    .insert({
      source_id: input.sourceId,
      representation_id: input.representationId,
      title,
      start_ms: input.startMs,
      end_ms: input.endMs,
      excerpt_text: input.excerpt.trim(),
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Could not create the excerpt:", error);
    return { error: "Could not create the excerpt. Please try again." };
  }

  // Embeds as soon as the clip is created, so it is semantically searchable
  // immediately rather than at the next reindex — a clip's title is exactly
  // the editorial summary semantic search is best at (design doc §6), and
  // it's one short embedding request. Best-effort: the row is already
  // flagged embedding_stale by a trigger, so a failure here just defers it.
  if (input.representationId) {
    await embedPendingForRepresentation(supabase, input.representationId);
  }
  await revalidateSource(supabase, input.sourceId);
  return { id: data.id };
}

/**
 * Nudges a clip's trim points. The server clamps and is the source of
 * truth for the applied values — the caller's requested startMs/endMs are a
 * proposal, not a guarantee, so the response always carries what actually
 * got saved.
 */
export async function updateClipTrim(input: {
  clipId: string;
  startMs: number;
  endMs: number;
}): Promise<{ startMs: number; endMs: number } | { error: string }> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { data: clip, error: clipError } = await supabase
    .from("sw_source_excerpts")
    .select("source_id")
    .eq("id", input.clipId)
    .maybeSingle();
  if (clipError) {
    console.error("Could not read the excerpt to trim:", clipError);
    return { error: "Could not save the trim. Please try again." };
  }
  if (!clip) return { error: "That excerpt no longer exists." };

  const { data: source, error: sourceError } = await supabase
    .from("sw_sources")
    .select("original_duration_ms")
    .eq("id", clip.source_id)
    .maybeSingle();
  if (sourceError) {
    console.error("Could not read the source to trim against:", sourceError);
    return { error: "Could not save the trim. Please try again." };
  }

  const upperBound = source?.original_duration_ms ?? Number.MAX_SAFE_INTEGER;
  const startMs = Math.max(0, Math.min(input.startMs, upperBound - MIN_CLIP_DURATION_MS));
  const endMs = Math.min(upperBound, Math.max(input.endMs, startMs + MIN_CLIP_DURATION_MS));

  const { error } = await supabase
    .from("sw_source_excerpts")
    .update({ start_ms: startMs, end_ms: endMs })
    .eq("id", input.clipId);

  if (error) {
    console.error("Could not save the trim:", error);
    return { error: "Could not save the trim. Please try again." };
  }
  await revalidateSource(supabase, clip.source_id);
  return { startMs, endMs };
}

export async function renameClip(input: {
  clipId: string;
  title: string;
}): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const title = input.title.trim();
  if (!title) return { error: "Give the excerpt a title." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sw_source_excerpts")
    .update({ title })
    .eq("id", input.clipId)
    .select("source_id, representation_id")
    .maybeSingle();

  if (error) {
    console.error("Could not rename the excerpt:", error);
    return { error: "Could not rename the excerpt." };
  }
  if (!data) return { error: "That excerpt no longer exists." };

  if (data.representation_id) {
    await embedPendingForRepresentation(supabase, data.representation_id);
  }
  await revalidateSource(supabase, data.source_id);
  return {};
}

/**
 * Removes the clip and any WAV it already rendered. Storage first: a clip
 * row that's gone while its export lingers is an orphaned object nothing
 * points at, whereas a failed row delete after a successful object delete
 * just means the next export re-renders.
 */
export async function deleteClip(clipId: string): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { data: clip, error: clipError } = await supabase
    .from("sw_source_excerpts")
    .select("id, source_id, export_storage_path")
    .eq("id", clipId)
    .maybeSingle();
  if (clipError) {
    console.error("Could not read the excerpt to delete:", clipError);
    return { error: "Could not delete the excerpt." };
  }
  if (!clip) return { error: "That excerpt no longer exists." };

  if (clip.export_storage_path) {
    const { error: storageError } = await supabase.storage
      .from(TRANSCRIPTION_MEDIA_BUCKET)
      .remove([clip.export_storage_path]);
    if (storageError) {
      console.error("Could not remove the exported audio. Please try again:", storageError);
      return { error: "Could not remove the exported audio. Please try again." };
    }
  }

  // deleteOrFail redirects; this action returns { error }, so check the rows directly.
  const { data: deleted, error } = await supabase
    .from("sw_source_excerpts")
    .delete()
    .eq("id", clipId)
    .select("id");
  if (error) {
    console.error("Could not delete the excerpt:", error);
    return { error: "Could not delete the excerpt." };
  }
  if (!deleted || deleted.length === 0) {
    return { error: "That excerpt no longer exists, or you don't have permission to delete it." };
  }

  await revalidateSource(supabase, clip.source_id);
  return {};
}

/**
 * A fresh signed URL for an already-exported clip. Signing at page-render
 * time means a workspace left open outlives its own download links, so the
 * rail asks for one at the moment Download is clicked instead.
 */
export async function getClipDownloadUrl(
  clipId: string,
): Promise<{ downloadUrl: string } | { error: string }> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { data: clip, error: clipError } = await supabase
    .from("sw_source_excerpts")
    .select("title, source_id, export_storage_path")
    .eq("id", clipId)
    .maybeSingle();
  if (clipError) {
    console.error("Could not read the excerpt to download:", clipError);
    return { error: "Could not create a download link. Please try again." };
  }
  if (!clip?.export_storage_path) {
    return { error: "This excerpt hasn't been exported yet." };
  }

  const projectId = await getPrimaryProjectIdForSource(supabase, clip.source_id);
  const { data: project, error: projectError } = projectId
    ? await supabase.from("tw_projects").select("title").eq("id", projectId).maybeSingle()
    : { data: null, error: null };
  if (projectError) {
    console.error("Could not read the download filename's inputs:", projectError);
    return { error: "Could not create a download link. Please try again." };
  }

  const downloadUrl = await getSignedMediaUrl(
    clip.export_storage_path,
    buildExcerptExportFilename(
      project?.title ?? "interview",
      (await speakerLabels(supabase, [clipId])).get(clipId) ?? null,
      clip.title,
    ),
  );
  if (!downloadUrl) return { error: "Could not create a download link. Please try again." };

  return { downloadUrl };
}

export async function exportClip(
  clipId: string,
): Promise<{ downloadUrl: string } | { error: string }> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { data: clip, error: clipError } = await supabase
    .from("sw_source_excerpts")
    .select("id, source_id, title, start_ms, end_ms")
    .eq("id", clipId)
    .maybeSingle();
  if (clipError) {
    console.error("Could not read the excerpt to export:", clipError);
    return { error: "Could not export this excerpt. Please try again." };
  }
  if (!clip) return { error: "That excerpt no longer exists." };
  if (clip.start_ms == null || clip.end_ms == null) {
    return { error: "Only audio/video excerpts can be exported as WAV." };
  }

  const { data: source, error: sourceError } = await supabase
    .from("sw_sources")
    .select("original_storage_path")
    .eq("id", clip.source_id)
    .maybeSingle();
  if (sourceError) {
    console.error("Could not read the source to export from:", sourceError);
    return { error: "Could not export this excerpt. Please try again." };
  }
  if (!source?.original_storage_path) return { error: "The source media isn't available." };

  const sourceUrl = await getSignedMediaUrl(source.original_storage_path);
  if (!sourceUrl) return { error: "Could not access the source media." };

  let wav: Buffer;
  try {
    wav = await renderClipWav(sourceUrl, clip.start_ms, clip.end_ms);
  } catch {
    return { error: "Could not export this excerpt. Please try again." };
  }

  const exportPath = excerptExportObjectPath(clip.source_id, clip.id);
  const { error: uploadError } = await supabase.storage
    .from(TRANSCRIPTION_MEDIA_BUCKET)
    .upload(exportPath, wav, { contentType: "audio/wav", upsert: true });
  if (uploadError) {
    console.error("Could not upload the exported excerpt:", uploadError);
    return { error: "Could not save the exported excerpt." };
  }

  const { error: recordError } = await supabase
    .from("sw_source_excerpts")
    .update({ export_storage_path: exportPath, exported_at: new Date().toISOString() })
    .eq("id", clip.id);
  if (recordError) {
    console.error("Could not record the exported excerpt:", recordError);
    return { error: "Could not save the exported excerpt." };
  }

  const projectId = await getPrimaryProjectIdForSource(supabase, clip.source_id);
  const { data: project, error: projectError } = projectId
    ? await supabase.from("tw_projects").select("title").eq("id", projectId).maybeSingle()
    : { data: null, error: null };
  // Deliberate degrade: the project title only names the download file.
  if (projectError)
    console.error("Could not read the project title for the filename:", projectError);

  const downloadFilename = buildExcerptExportFilename(
    project?.title ?? "interview",
    (await speakerLabels(supabase, [clipId])).get(clipId) ?? null,
    clip.title,
  );
  const downloadUrl = await getSignedMediaUrl(exportPath, downloadFilename);
  if (!downloadUrl)
    return { error: "Exported, but couldn't create a download link. Reload and try again." };

  await revalidateSource(supabase, clip.source_id);
  return { downloadUrl };
}
