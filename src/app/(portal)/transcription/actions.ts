"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { TRANSCRIPTION_MEDIA_BUCKET, isAllowedMediaType } from "@/lib/transcription/media";

export type CreateProjectResult = { id: string } | { error: string };

/**
 * Creates the project row before any upload starts, with status='uploading'
 * — so an abandoned upload is a visible, cleanable row rather than an
 * orphaned storage object (see design doc §6). Called directly from the
 * client upload form (not a <form action>), because the caller needs the
 * new id back to know where to put the file next.
 */
export async function createProject(input: {
  title: string;
  description: string;
  interviewDate: string;
}): Promise<CreateProjectResult> {
  const { profile } = await assertToolAccess("transcription");

  const title = input.title.trim();
  if (!title) {
    return { error: "Give the interview a title." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tw_projects")
    .insert({
      title,
      description: input.description.trim() || null,
      interview_date: input.interviewDate || null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: "Could not create the project. Please try again." };
  }
  return { id: data.id };
}

/**
 * Finalizes a project after the browser has uploaded its source file
 * directly to Storage (never through this server). Flips status straight
 * to 'ready' — Phase 1 has no transcription pipeline yet, so there is no
 * 'processing' step between upload and playable; that stage gets used
 * starting in Phase 2's transcription kickoff.
 */
export async function completeProjectUpload(input: {
  projectId: string;
  contentType: string;
  storagePath: string;
  sizeBytes: number;
  durationMs: number | null;
}): Promise<{ error?: string }> {
  await assertToolAccess("transcription");

  if (!isAllowedMediaType(input.contentType)) {
    return { error: "That file type isn't supported." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tw_projects")
    .update({
      media_storage_path: input.storagePath,
      media_content_type: input.contentType,
      media_size_bytes: input.sizeBytes,
      media_duration_ms: input.durationMs,
      status: "ready",
      error_message: null,
    })
    .eq("id", input.projectId);

  if (error) {
    return { error: "The upload finished, but we couldn't save the project. Please try again." };
  }
  return {};
}

/** Marks a project failed after a client-side upload error, with a reason a reporter can act on. */
export async function failProjectUpload(input: {
  projectId: string;
  message: string;
}): Promise<void> {
  await assertToolAccess("transcription");

  const supabase = await createClient();
  await supabase
    .from("tw_projects")
    .update({ status: "failed", error_message: input.message })
    .eq("id", input.projectId);
}

/**
 * Deletes a project and its source media together. Only the uploader can do
 * this (matches the tw_projects RLS delete policy) — checked explicitly
 * here, not just left to RLS, because the storage bucket's own policies are
 * membership-wide by design (see the schema migration's tw_media_delete
 * policy comment): without this check a non-owner could strip the media
 * object while the row delete silently no-ops under RLS, leaving an
 * orphaned row.
 */
export async function deleteProject(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("transcription");
  const projectId = String(formData.get("project_id") ?? "");

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("tw_projects")
    .select("media_storage_path, created_by")
    .eq("id", projectId)
    .maybeSingle();

  if (!project || project.created_by !== profile.id) {
    redirect("/transcription");
  }

  if (project.media_storage_path) {
    await supabase.storage.from(TRANSCRIPTION_MEDIA_BUCKET).remove([project.media_storage_path]);
  }
  await supabase.from("tw_projects").delete().eq("id", projectId);

  redirect("/transcription");
}
