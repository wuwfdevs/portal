"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { createSourceForExistingProject } from "@/lib/transcription/ingest";
import { finalizeSourceUpload } from "@/lib/transcription/source-upload";
import { getSourceRef } from "@/lib/transcription/projects";
import type { SwSourceKind } from "@/lib/database.types";

// Attaching an existing source to a second project (docs/sourcework-design.md
// §7.3) — the "+ Reference another source" picker's server half. No
// confirmation step: sharing a source across projects doesn't touch RLS or
// risk data loss, it's a product call the design doc left open and this repo
// resolved against the extra friction.

export interface AttachableSource {
  id: string;
  kind: SwSourceKind;
  title: string;
  interviewDate: string | null;
  durationMs: number | null;
  pageCount: number | null;
}

/**
 * Sources the caller can see that aren't already attached to `projectId` —
 * feeds the picker. RLS already scopes sw_sources to tool members; this just
 * excludes what's already on the project and applies the search box's query.
 * Both source kinds are returned (docs/sourcework-design.md §8.10) — a
 * project mixing an interview and a PDF is exactly the point.
 */
export async function listAttachableSources(
  projectId: string,
  query: string,
): Promise<AttachableSource[]> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { data: attached } = await supabase
    .from("sw_project_sources")
    .select("source_id")
    .eq("project_id", projectId);
  const attachedIds = new Set((attached ?? []).map((row) => row.source_id));

  let sourceQuery = supabase
    .from("sw_sources")
    .select("id, kind, title, interview_date, original_duration_ms, page_count")
    .order("created_at", { ascending: false })
    .limit(50);
  const trimmed = query.trim();
  if (trimmed) sourceQuery = sourceQuery.ilike("title", `%${trimmed}%`);

  const { data, error } = await sourceQuery;
  if (error) return [];

  return (data ?? [])
    .filter((source) => !attachedIds.has(source.id))
    .map((source) => ({
      id: source.id,
      kind: source.kind,
      title: source.title,
      interviewDate: source.interview_date,
      durationMs: source.original_duration_ms,
      pageCount: source.page_count,
    }));
}

/** Attaches an existing source to a project — the many-to-many shape sw_project_sources has carried since Phase 1. */
export async function attachSourceToProject(
  projectId: string,
  sourceId: string,
): Promise<{ error?: string }> {
  const { profile } = await assertToolAccess("transcription");
  const supabase = await createClient();

  const { error } = await supabase
    .from("sw_project_sources")
    .insert({ project_id: projectId, source_id: sourceId, added_by: profile.id });
  if (error) return { error: "Could not attach that source. Please try again." };

  revalidatePath(`/sourcework/${projectId}`);
  return {};
}

export type CreateSourceResult = { sourceId: string } | { error: string };

/**
 * Creates a brand-new source and attaches it to this project in one step —
 * the "Upload new" half of the Add source modal, as opposed to "Find
 * existing"'s attachSourceToProject above. Mirrors ../actions.ts's
 * createProject, minus the tw_projects row.
 */
export async function createSourceForProject(
  projectId: string,
  input: { title: string; kind?: SwSourceKind },
): Promise<CreateSourceResult> {
  const { profile } = await assertToolAccess("transcription");

  const title = input.title.trim();
  if (!title) {
    return { error: input.kind === "document" ? "Give the document a title." : "Give the recording a title." };
  }

  const supabase = await createClient();
  const created = await createSourceForExistingProject(supabase, {
    projectId,
    title,
    // See ../actions.ts's createProject — no date is collected at upload.
    interviewDate: null,
    createdBy: profile.id,
    kind: input.kind,
  });

  if ("error" in created) {
    return { error: "Could not create the source. Please try again." };
  }
  return created;
}

/**
 * Finalizes a newly uploaded source after the browser has uploaded its file
 * directly to Storage — the explicit-source-id counterpart to
 * ../actions.ts's completeProjectUpload, for a source attached to an
 * existing project rather than one created alongside a new project.
 */
export async function completeSourceUpload(input: {
  projectId: string;
  sourceId: string;
  contentType: string;
  storagePath: string;
  sizeBytes: number;
  durationMs: number | null;
}): Promise<{ error?: string }> {
  await assertToolAccess("transcription");

  const supabase = await createClient();
  const ref = await getSourceRef(supabase, input.sourceId);
  if (!ref.representationId) {
    return { error: "This source has no representation to process yet." };
  }

  const result = await finalizeSourceUpload(supabase, {
    sourceId: ref.sourceId,
    representationId: ref.representationId,
    contentType: input.contentType,
    storagePath: input.storagePath,
    sizeBytes: input.sizeBytes,
    durationMs: input.durationMs,
  });

  revalidatePath(`/sourcework/${input.projectId}`);
  return result;
}

/** Marks a newly attached source failed after a client-side upload error. */
export async function failSourceUpload(input: {
  projectId: string;
  sourceId: string;
  message: string;
}): Promise<void> {
  await assertToolAccess("transcription");

  const supabase = await createClient();
  await supabase
    .from("sw_sources")
    .update({ status: "failed", error_message: input.message })
    .eq("id", input.sourceId);

  revalidatePath(`/sourcework/${input.projectId}`);
}
