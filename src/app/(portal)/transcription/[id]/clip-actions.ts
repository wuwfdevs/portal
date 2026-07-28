"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { renderClipWav } from "@/lib/transcription/export";
import { embedPending, getProjectContext } from "@/lib/transcription/indexing";
import {
  MAX_CLIP_DURATION_MS,
  TRANSCRIPTION_MEDIA_BUCKET,
  buildClipExportFilename,
  clipExportObjectPath,
} from "@/lib/transcription/media";

// Clip creation, trim, and export — see
// docs/transcription-workspace-design.md Phase 4. Same shared-workspace
// trust model as transcript correction: any tool member can create, adjust,
// or export any clip in a project they have access to.

const MIN_CLIP_DURATION_MS = 500;

function revalidateProject(projectId: string) {
  revalidatePath(`/transcription/${projectId}`);
  // A clip is a result in the cross-project library and search list too.
  revalidatePath("/transcription");
}

/**
 * Embeds a clip as soon as it is created or retitled, so it is semantically
 * searchable immediately rather than at the next reindex — a clip's title is
 * exactly the editorial summary semantic search is best at (design doc §6),
 * and it's one short embedding request.
 *
 * Best-effort by design: the row is already flagged embedding_stale by a
 * trigger, so a failure here just defers the work. Never blocks the write.
 */
async function embedClipQuietly(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<void> {
  try {
    const context = await getProjectContext(supabase, projectId);
    if (context) await embedPending(supabase, projectId, context);
  } catch (error) {
    console.error("[transcription] clip embedding failed", { projectId, error });
  }
}

export async function createClip(input: {
  projectId: string;
  startMs: number;
  endMs: number;
  title: string;
  excerpt: string;
}): Promise<{ id: string } | { error: string }> {
  const { profile } = await assertToolAccess("transcription");
  const title = input.title.trim();

  if (!title) return { error: "Give the clip a title." };
  if (input.endMs - input.startMs < MIN_CLIP_DURATION_MS) {
    return { error: "That selection is too short to make a clip." };
  }
  if (input.endMs - input.startMs > MAX_CLIP_DURATION_MS) {
    return { error: "That selection is too long for a single clip — try a shorter excerpt." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tw_clips")
    .insert({
      project_id: input.projectId,
      title,
      start_ms: input.startMs,
      end_ms: input.endMs,
      excerpt: input.excerpt.trim(),
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not create the clip. Please try again." };
  await embedClipQuietly(supabase, input.projectId);
  revalidateProject(input.projectId);
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

  const { data: clip } = await supabase
    .from("tw_clips")
    .select("project_id")
    .eq("id", input.clipId)
    .maybeSingle();
  if (!clip) return { error: "That clip no longer exists." };

  const { data: project } = await supabase
    .from("tw_projects")
    .select("media_duration_ms")
    .eq("id", clip.project_id)
    .maybeSingle();

  const upperBound = project?.media_duration_ms ?? Number.MAX_SAFE_INTEGER;
  const startMs = Math.max(0, Math.min(input.startMs, upperBound - MIN_CLIP_DURATION_MS));
  const endMs = Math.min(upperBound, Math.max(input.endMs, startMs + MIN_CLIP_DURATION_MS));

  const { error } = await supabase
    .from("tw_clips")
    .update({ start_ms: startMs, end_ms: endMs })
    .eq("id", input.clipId);

  if (error) return { error: "Could not save the trim. Please try again." };
  revalidateProject(clip.project_id);
  return { startMs, endMs };
}

export async function renameClip(input: {
  clipId: string;
  title: string;
}): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const title = input.title.trim();
  if (!title) return { error: "Give the clip a title." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tw_clips")
    .update({ title })
    .eq("id", input.clipId)
    .select("project_id")
    .maybeSingle();

  if (error) return { error: "Could not rename the clip." };
  if (!data) return { error: "That clip no longer exists." };

  await embedClipQuietly(supabase, data.project_id);
  revalidateProject(data.project_id);
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

  const { data: clip } = await supabase
    .from("tw_clips")
    .select("id, project_id, export_storage_path")
    .eq("id", clipId)
    .maybeSingle();
  if (!clip) return { error: "That clip no longer exists." };

  if (clip.export_storage_path) {
    const { error: storageError } = await supabase.storage
      .from(TRANSCRIPTION_MEDIA_BUCKET)
      .remove([clip.export_storage_path]);
    if (storageError) return { error: "Could not remove the exported audio. Please try again." };
  }

  const { error } = await supabase.from("tw_clips").delete().eq("id", clipId);
  if (error) return { error: "Could not delete the clip." };

  revalidateProject(clip.project_id);
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

  const { data: clip } = await supabase
    .from("tw_clips")
    .select("title, project_id, export_storage_path")
    .eq("id", clipId)
    .maybeSingle();
  if (!clip?.export_storage_path) {
    return { error: "This clip hasn't been exported yet." };
  }

  const { data: project } = await supabase
    .from("tw_projects")
    .select("title, interview_date, created_at")
    .eq("id", clip.project_id)
    .maybeSingle();

  const downloadUrl = await getSignedMediaUrl(
    clip.export_storage_path,
    buildClipExportFilename(
      project?.interview_date ?? project?.created_at ?? new Date().toISOString(),
      project?.title ?? "interview",
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

  const { data: clip } = await supabase
    .from("tw_clips")
    .select("id, project_id, title, start_ms, end_ms")
    .eq("id", clipId)
    .maybeSingle();
  if (!clip) return { error: "That clip no longer exists." };

  const { data: project } = await supabase
    .from("tw_projects")
    .select("media_storage_path, title, interview_date, created_at")
    .eq("id", clip.project_id)
    .maybeSingle();
  if (!project?.media_storage_path) return { error: "The source media isn't available." };

  const sourceUrl = await getSignedMediaUrl(project.media_storage_path);
  if (!sourceUrl) return { error: "Could not access the source media." };

  let wav: Buffer;
  try {
    wav = await renderClipWav(sourceUrl, clip.start_ms, clip.end_ms);
  } catch {
    return { error: "Could not export this clip. Please try again." };
  }

  const exportPath = clipExportObjectPath(clip.project_id, clip.id);
  const { error: uploadError } = await supabase.storage
    .from(TRANSCRIPTION_MEDIA_BUCKET)
    .upload(exportPath, wav, { contentType: "audio/wav", upsert: true });
  if (uploadError) return { error: "Could not save the exported clip." };

  await supabase
    .from("tw_clips")
    .update({ export_storage_path: exportPath, exported_at: new Date().toISOString() })
    .eq("id", clip.id);

  const downloadFilename = buildClipExportFilename(
    project.interview_date ?? project.created_at,
    project.title,
    clip.title,
  );
  const downloadUrl = await getSignedMediaUrl(exportPath, downloadFilename);
  if (!downloadUrl)
    return { error: "Exported, but couldn't create a download link. Reload and try again." };

  revalidateProject(clip.project_id);
  return { downloadUrl };
}
