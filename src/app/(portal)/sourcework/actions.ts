"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { TRANSCRIPTION_MEDIA_BUCKET } from "@/lib/transcription/media";
import { reindexRepresentation, embedPendingForProject } from "@/lib/transcription/indexing";
import { createProjectWithSource, startTranscriptionForProject } from "@/lib/transcription/ingest";
import { startDocumentProcessing } from "@/lib/transcription/document-ingest";
import { finalizeSourceUpload } from "@/lib/transcription/source-upload";
import { getPrimarySourceForProject, getSourceRef } from "@/lib/transcription/projects";
import type { SwSourceKind } from "@/lib/database.types";

export type CreateProjectResult = { id: string; sourceId: string } | { error: string };

/**
 * Creates the project, its source, and its (not-yet-started) primary
 * representation before any upload starts — the source is created with
 * status='uploading' so an abandoned upload is a visible, cleanable row
 * rather than an orphaned storage object (see design doc §6). Called
 * directly from the client upload form (not a <form action>), because the
 * caller needs the new ids back to know where to put the file next
 * (sourceObjectPath is keyed by source id, not project id).
 *
 * `kind` is the reporter's chosen file's source kind (docs/sourcework-design.md
 * §8.2) — audio_video (default) or document. It only decides which
 * representation kind gets created; the upload itself is still validated
 * against the actual file's content type in completeProjectUpload.
 */
export async function createProject(input: {
  title: string;
  description: string;
  kind?: SwSourceKind;
}): Promise<CreateProjectResult> {
  const { profile } = await assertToolAccess("transcription");

  const title = input.title.trim();
  if (!title) {
    return { error: input.kind === "document" ? "Give the document a title." : "Give the interview a title." };
  }

  const supabase = await createClient();
  const created = await createProjectWithSource(supabase, {
    title,
    description: input.description.trim() || null,
    // Sourcework no longer asks for a date at upload: a date fits an
    // interview and not a court filing or a records dump, and the one field
    // had to serve every source kind. Sources ingested from another tool
    // (audience-listening's handoff) still set it, so the column and
    // createProjectWithSource's parameter stay.
    interviewDate: null,
    createdBy: profile.id,
    kind: input.kind,
  });

  if ("error" in created) {
    return { error: "Could not create the project. Please try again." };
  }
  return { id: created.projectId, sourceId: created.sourceId };
}

/**
 * Edits a project's title and background text after the fact.
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
}): Promise<{ error?: string }> {
  await assertToolAccess("transcription");

  const title = input.title.trim();
  if (!title) {
    return { error: "A project needs a title." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("tw_projects")
    .update({ title, description: input.description.trim() || null })
    .eq("id", input.projectId);

  if (error) {
    console.error("Could not save the project details:", error);
    return { error: `Could not save the project details: ${error.message}` };
  }

  await embedPendingForProject(supabase, input.projectId);

  revalidatePath(`/sourcework/${input.projectId}`);
  revalidatePath("/sourcework");
  return {};
}

/**
 * Rebuilds one source's search index from its current transcript/document
 * text.
 *
 * Serves two jobs deliberately kept as one action: the Phase 5 backfill for
 * sources transcribed before search existed, and a manual re-run when a
 * reporter has finished a round of corrections. Both are "make the index
 * match the content", and a second entry point would only be a second thing
 * to keep in step.
 *
 * Takes an explicit sourceId rather than re-deriving the project's primary
 * source — same fix Phase 3a already made for clip creation and
 * transcription retry (docs/sourcework-design.md §7): reindexing whichever
 * source is actually on screen, not always the first one attached.
 */
export async function reindexProjectSearch(projectId: string, sourceId: string): Promise<{
  error?: string;
  chunks?: number;
  embedded?: number;
  embeddingError?: string;
}> {
  await assertToolAccess("transcription");

  const supabase = await createClient();
  try {
    const ref = await getSourceRef(supabase, sourceId);
    if (!ref.representationId) {
      return { error: "This source has no representation to index yet." };
    }
    const result = await reindexRepresentation(supabase, ref.representationId);
    revalidatePath(`/sourcework/${projectId}`);
    revalidatePath("/sourcework");
    return result;
  } catch (error) {
    console.error("[transcription] reindex failed", { projectId, sourceId, error });
    return { error: "Could not rebuild the search index for this source." };
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

  const supabase = await createClient();
  const ref = await getPrimarySourceForProject(supabase, input.projectId);
  if (!ref) return { error: "This project has no source to attach media to." };
  if (!ref.representationId) {
    return { error: "This project has no representation to process yet." };
  }

  return finalizeSourceUpload(supabase, {
    sourceId: ref.sourceId,
    representationId: ref.representationId,
    contentType: input.contentType,
    storagePath: input.storagePath,
    sizeBytes: input.sizeBytes,
    durationMs: input.durationMs,
  });
}

/**
 * Re-kicks transcription after a transcription-stage failure (media is
 * already uploaded, so this is distinct from re-uploading). Any tool member
 * can retry, not just the uploader — matches the shared-workspace CRUD model
 * used for speakers/segments/clips.
 *
 * source_id is which pill the reporter was looking at when they hit Retry —
 * it defaults to the project's primary source for a plain single-source
 * project, but must be honored explicitly once a project can reference more
 * than one source, or a retry on a failed second source would silently
 * re-kick the first one instead.
 */
export async function retryTranscription(formData: FormData): Promise<void> {
  await assertToolAccess("transcription");
  const projectId = String(formData.get("project_id") ?? "");
  const requestedSourceId = formData.get("source_id");
  // Source Detail retries from its own page rather than the project's — only
  // ever a same-tool path we rendered ourselves, but still checked against
  // an open redirect since it rides in on a form field.
  const returnTo = formData.get("return_to");
  const redirectTo =
    typeof returnTo === "string" && returnTo.startsWith("/sourcework/")
      ? returnTo
      : `/sourcework/${projectId}`;

  const supabase = await createClient();
  const ref = requestedSourceId
    ? await getSourceRef(supabase, String(requestedSourceId))
    : await getPrimarySourceForProject(supabase, projectId);
  const { data: source } = ref
    ? await supabase
        .from("sw_sources")
        .select("kind, original_storage_path")
        .eq("id", ref.sourceId)
        .maybeSingle()
    : { data: null };

  if (ref?.representationId && source?.original_storage_path) {
    // Retry is only ever offered when the file itself is already in Storage
    // (hasMedia — see representation-status-banner.tsx), so reaching this
    // point means the source's own upload succeeded. Clear any stale
    // status='failed'/error_message a source can be left carrying from
    // before the fix that stopped completeProjectUpload/completeSourceUpload
    // from marking the *source* failed on a processing-kickoff error that
    // was really about the representation (new-project-form.tsx,
    // add-source-modal.tsx) — without this, a source stuck that way stays
    // stuck forever, since nothing else ever clears it once set.
    await supabase.from("sw_sources").update({ status: "ready", error_message: null }).eq("id", ref.sourceId);

    if (source.kind === "document") {
      // startDocumentProcessing does its own status flip (and its own
      // stuck-run recovery, see docs/sourcework-design.md §8.6) — unlike
      // the transcription path below, it must decide that itself rather
      // than being told "processing" unconditionally.
      await startDocumentProcessing(supabase, {
        representationId: ref.representationId,
        sourceId: ref.sourceId,
        storagePath: source.original_storage_path,
      });
    } else {
      await supabase
        .from("sw_representations")
        .update({ status: "processing", error_message: null })
        .eq("id", ref.representationId);
      await startTranscriptionForProject(supabase, {
        representationId: ref.representationId,
        storagePath: source.original_storage_path,
      });
    }
  }

  redirect(redirectTo);
}

/** Marks a project's source failed after a client-side upload error, with a reason a reporter can act on. */
export async function failProjectUpload(input: {
  projectId: string;
  message: string;
}): Promise<void> {
  await assertToolAccess("transcription");

  const supabase = await createClient();
  const ref = await getPrimarySourceForProject(supabase, input.projectId);
  if (ref) {
    await supabase
      .from("sw_sources")
      .update({ status: "failed", error_message: input.message })
      .eq("id", ref.sourceId);
  }
}

/**
 * Deletes a project and, if no other project references its source, the
 * source and everything derived from it (representations, segments,
 * speakers, chunks, excerpts all cascade from sw_sources — see the Phase 1
 * migration). Only the uploader can do this (matches the tw_projects RLS
 * delete policy) — checked explicitly here, not just left to RLS, because
 * the storage bucket's own policies are membership-wide by design (see the
 * schema migration's tw_media_delete policy comment): without this check a
 * non-owner could strip the media object while the row delete silently
 * no-ops under RLS, leaving an orphaned row.
 */
export async function deleteProject(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("transcription");
  const projectId = String(formData.get("project_id") ?? "");

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("tw_projects")
    .select("created_by")
    .eq("id", projectId)
    .maybeSingle();

  if (!project || project.created_by !== profile.id) {
    redirect("/sourcework");
  }

  const ref = await getPrimarySourceForProject(supabase, projectId);
  if (ref) {
    const { data: source } = await supabase
      .from("sw_sources")
      .select("original_storage_path")
      .eq("id", ref.sourceId)
      .maybeSingle();

    const { count: otherReferences } = await supabase
      .from("sw_project_sources")
      .select("project_id", { count: "exact", head: true })
      .eq("source_id", ref.sourceId)
      .neq("project_id", projectId);

    if (!otherReferences) {
      // Rendered clip exports live under <source id>/excerpts/ and are not
      // reachable from the source row once it's gone, so they have to be
      // swept here — deleting the row cascades sw_source_excerpts but tells
      // storage nothing.
      const { data: exportedClips } = await supabase.storage
        .from(TRANSCRIPTION_MEDIA_BUCKET)
        .list(`${ref.sourceId}/excerpts`);

      const objectPaths = [
        ...(source?.original_storage_path ? [source.original_storage_path] : []),
        ...(exportedClips ?? []).map((object) => `${ref.sourceId}/excerpts/${object.name}`),
      ];
      if (objectPaths.length > 0) {
        await supabase.storage.from(TRANSCRIPTION_MEDIA_BUCKET).remove(objectPaths);
      }
      await supabase.from("sw_sources").delete().eq("id", ref.sourceId);
    }
  }

  await supabase.from("tw_projects").delete().eq("id", projectId);

  revalidatePath("/sourcework");
  redirect("/sourcework");
}
