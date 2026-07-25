"use server";

import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { renderClipWav } from "@/lib/transcription/export";
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
  return { startMs, endMs };
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

  return { downloadUrl };
}
