"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { TRANSCRIPTION_MEDIA_BUCKET, isAllowedMediaType } from "@/lib/transcription/media";
import { getSignedMediaUrlForIngest } from "@/lib/transcription/storage";
import { getTranscriptionProvider } from "@/lib/transcription/asr";
import { reindexProject, embedPending, getProjectContext } from "@/lib/transcription/indexing";
import { getSiteUrl } from "@/lib/site-url";

export type CreateProjectResult = { id: string } | { error: string };

/**
 * Strips URLs out of a provider error before it's persisted or logged. The
 * signed ingest URL we hand the ASR provider is a six-hour read credential for
 * the source media, and providers routinely echo the offending request back in
 * their error text — error_message is rendered on the project screen, so it
 * must not become a place that token gets written down.
 */
function redactUrls(message: string): string {
  return message.replace(/https?:\/\/\S+/gi, "[url]");
}

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
 * Edits a project's title, interview date, and background text after the fact.
 *
 * The background is the tool's whole context story (design doc §3G): it is
 * what tells a reporter who finds a quote eighteen months from now what the
 * recording actually was. Until this action existed, createProject() was the
 * only thing that ever wrote it — so it got typed at upload, before anyone
 * had listened, or never. This is the same field, made editable from the
 * workspace, where a reporter is sitting when they actually learn what they
 * recorded.
 *
 * Any member can edit, matching the shared-workspace model used for speakers,
 * segments and clips. Editing marks the project's chunks stale (a database
 * trigger), because the background rides along on every chunk's embedding —
 * so the re-embed below picks the change up.
 */
export async function updateProjectDetails(input: {
  projectId: string;
  title: string;
  description: string;
  interviewDate: string;
}): Promise<{ error?: string }> {
  await assertToolAccess("transcription");

  const title = input.title.trim();
  if (!title) {
    return { error: "A project needs a title." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tw_projects")
    .update({
      title,
      description: input.description.trim() || null,
      interview_date: input.interviewDate || null,
    })
    .eq("id", input.projectId);

  if (error) {
    console.error("Could not save the project details:", error);
    return { error: `Could not save the project details: ${error.message}` };
  }

  await reembedProjectQuietly(supabase, input.projectId);

  revalidatePath(`/transcription/${input.projectId}`);
  revalidatePath("/transcription");
  return {};
}

/**
 * Rebuilds a project's search index from its current transcript.
 *
 * Serves two jobs deliberately kept as one action: the Phase 5 backfill for
 * projects transcribed before search existed, and a manual re-run when a
 * reporter has finished a round of corrections. Both are "make the index
 * match the transcript", and a second entry point would only be a second
 * thing to keep in step.
 */
export async function reindexProjectSearch(projectId: string): Promise<{
  error?: string;
  chunks?: number;
  embedded?: number;
  embeddingError?: string;
}> {
  await assertToolAccess("transcription");

  const supabase = await createClient();
  try {
    const result = await reindexProject(supabase, projectId);
    revalidatePath(`/transcription/${projectId}`);
    revalidatePath("/transcription");
    return result;
  } catch (error) {
    console.error("[transcription] reindex failed", { projectId, error });
    return { error: "Could not rebuild the search index for this project." };
  }
}

/**
 * Best-effort re-embed after an edit. Never blocks or fails the write that
 * triggered it: the rows stay flagged stale, so the next reindex or edit
 * picks them up, and in the meantime the stale embedding still points at
 * substantially the same passage (design doc §6, "staleness over eagerness").
 */
async function reembedProjectQuietly(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<void> {
  try {
    const context = await getProjectContext(supabase, projectId);
    if (context) await embedPending(supabase, projectId, context);
  } catch (error) {
    console.error("[transcription] re-embed after edit failed", { projectId, error });
  }
}

/**
 * Kicks off transcription for a project whose source media is already in
 * Storage, and updates the row accordingly. Shared by completeProjectUpload
 * (automatic kickoff right after upload) and retryTranscription (manual
 * re-kick after a transcription-stage failure) — both already know the
 * project has a valid media_storage_path/media_content_type before calling
 * this.
 */
async function startTranscriptionForProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: { projectId: string; storagePath: string },
): Promise<{ error?: string }> {
  const mediaUrl = await getSignedMediaUrlForIngest(params.storagePath);
  const webhookSecret = process.env.TRANSCRIPTION_WEBHOOK_SECRET;

  // Name the specific missing piece. These are variable *names*, never values,
  // and only tool members reach this screen — worth surfacing, because an
  // unset ASSEMBLYAI_API_KEY otherwise threw inside the try below and arrived
  // as the same "please try again" as a genuine provider outage.
  if (!process.env.ASSEMBLYAI_API_KEY || !webhookSecret) {
    const missing = [
      !process.env.ASSEMBLYAI_API_KEY && "ASSEMBLYAI_API_KEY",
      !webhookSecret && "TRANSCRIPTION_WEBHOOK_SECRET",
    ].filter((name): name is string => Boolean(name));
    const message = `Transcription isn't configured yet (missing ${missing.join(" and ")}).`;
    await supabase
      .from("tw_projects")
      .update({ status: "failed", error_message: message })
      .eq("id", params.projectId);
    return { error: message };
  }

  if (!mediaUrl) {
    const message = "Couldn't read the uploaded media file. Please re-upload.";
    await supabase
      .from("tw_projects")
      .update({ status: "failed", error_message: message })
      .eq("id", params.projectId);
    return { error: message };
  }

  try {
    const providerJobId = await getTranscriptionProvider().startTranscription({
      mediaUrl,
      webhookUrl: `${getSiteUrl()}/api/transcription/webhook`,
      webhookSecret,
    });

    await supabase
      .from("tw_projects")
      .update({
        status: "processing",
        transcription_provider_job_id: providerJobId,
        error_message: null,
      })
      .eq("id", params.projectId);

    return {};
  } catch (error) {
    // Surface the provider's actual complaint rather than a generic retry
    // prompt — same as the webhook handler does on the finishing side. A bare
    // "please try again" made a rejected request parameter look identical to a
    // transient blip, which is how an always-failing kickoff went unexplained.
    const reason = redactUrls(error instanceof Error ? error.message : String(error));
    const message = `Could not start transcription: ${reason}`;

    console.error("[transcription] startTranscription failed", {
      projectId: params.projectId,
      error: reason,
    });

    await supabase
      .from("tw_projects")
      .update({ status: "failed", error_message: message })
      .eq("id", params.projectId);
    return { error: message };
  }
}

/**
 * Finalizes a project after the browser has uploaded its source file
 * directly to Storage (never through this server), then kicks off
 * transcription automatically — there's no scenario where a reporter
 * uploads and doesn't want a transcript (see design doc §3A).
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
      status: "processing",
      error_message: null,
    })
    .eq("id", input.projectId);

  if (error) {
    return { error: "The upload finished, but we couldn't save the project. Please try again." };
  }

  return startTranscriptionForProject(supabase, {
    projectId: input.projectId,
    storagePath: input.storagePath,
  });
}

/**
 * Re-kicks transcription after a transcription-stage failure (media is
 * already uploaded, so this is distinct from re-uploading). Any tool member
 * can retry, not just the uploader — matches the shared-workspace CRUD model
 * used for speakers/segments/clips.
 */
export async function retryTranscription(formData: FormData): Promise<void> {
  await assertToolAccess("transcription");
  const projectId = String(formData.get("project_id") ?? "");

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("tw_projects")
    .select("media_storage_path")
    .eq("id", projectId)
    .maybeSingle();

  if (project?.media_storage_path) {
    await supabase
      .from("tw_projects")
      .update({ status: "processing", error_message: null })
      .eq("id", projectId);
    await startTranscriptionForProject(supabase, {
      projectId,
      storagePath: project.media_storage_path,
    });
  }

  redirect(`/transcription/${projectId}`);
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

  // Rendered clip exports live under <project id>/clips/ and are not
  // reachable from the project row once it's gone, so they have to be swept
  // here — deleting the row cascades tw_clips but tells storage nothing.
  const { data: exportedClips } = await supabase.storage
    .from(TRANSCRIPTION_MEDIA_BUCKET)
    .list(`${projectId}/clips`);

  const objectPaths = [
    ...(project.media_storage_path ? [project.media_storage_path] : []),
    ...(exportedClips ?? []).map((object) => `${projectId}/clips/${object.name}`),
  ];
  if (objectPaths.length > 0) {
    await supabase.storage.from(TRANSCRIPTION_MEDIA_BUCKET).remove(objectPaths);
  }

  await supabase.from("tw_projects").delete().eq("id", projectId);

  revalidatePath("/transcription");
  redirect("/transcription");
}
