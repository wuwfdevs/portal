"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";

// Attaching an existing source to a second project (docs/sourcework-design.md
// §7.3) — the "+ Reference another source" picker's server half. No
// confirmation step: sharing a source across projects doesn't touch RLS or
// risk data loss, it's a product call the design doc left open and this repo
// resolved against the extra friction.

export interface AttachableSource {
  id: string;
  title: string;
  interviewDate: string | null;
  durationMs: number | null;
}

/**
 * Sources the caller can see that aren't already attached to `projectId` —
 * feeds the picker. RLS already scopes sw_sources to tool members; this just
 * excludes what's already on the project and applies the search box's query.
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
    .select("id, title, interview_date, original_duration_ms")
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
      title: source.title,
      interviewDate: source.interview_date,
      durationMs: source.original_duration_ms,
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
