"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { embedPendingDataPoints } from "@/lib/transcription/indexing";
import { listLibraryClips } from "@/lib/transcription/clips";
import type { SwSourceKind } from "@/lib/database.types";

// Sourcework Phase 4 (docs/sourcework-design.md §9): research questions and
// data points. Same shared-workspace trust model as clip-actions.ts — any
// tool member can create, edit, or reorganize any project's research
// questions and data points.

function revalidateResearch(projectId: string) {
  revalidatePath(`/sourcework/${projectId}/research`);
}

// Research questions -----------------------------------------------------

export async function createResearchQuestion(
  projectId: string,
  prompt: string,
): Promise<{ id: string } | { error: string }> {
  const { profile } = await assertToolAccess("transcription");
  const trimmed = prompt.trim();
  if (!trimmed) return { error: "Give the question some text." };

  const supabase = await createClient();

  // Next position across every question this project has, active or not —
  // avoids colliding with a deactivated question's position (§9.2's unique
  // (project_id, position) constraint applies to the whole set).
  const { data: last } = await supabase
    .from("sw_research_questions")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (last?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from("sw_research_questions")
    .insert({
      project_id: projectId,
      prompt: trimmed,
      position: nextPosition,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not add the research question. Please try again." };
  revalidateResearch(projectId);
  return { id: data.id };
}

export async function updateResearchQuestion(
  questionId: string,
  prompt: string,
): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const trimmed = prompt.trim();
  if (!trimmed) return { error: "Give the question some text." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sw_research_questions")
    .update({ prompt: trimmed })
    .eq("id", questionId)
    .select("project_id")
    .maybeSingle();

  if (error) return { error: "Could not update the question." };
  if (!data) return { error: "That question no longer exists." };

  revalidateResearch(data.project_id);
  return {};
}

export async function setResearchQuestionActive(
  questionId: string,
  active: boolean,
): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sw_research_questions")
    .update({ active })
    .eq("id", questionId)
    .select("project_id")
    .maybeSingle();

  if (error) return { error: `Could not ${active ? "reactivate" : "deactivate"} the question.` };
  if (!data) return { error: "That question no longer exists." };

  revalidateResearch(data.project_id);
  return {};
}

/**
 * Swaps a question's position with its neighbor among *active* questions
 * only — a deactivated question sitting between two active ones (in
 * position order) is skipped over, so reordering the visible list never
 * disturbs a row the reporter can't currently see. Swaps the two existing
 * position values directly rather than renumbering the whole list, so
 * there's no risk of colliding with a deactivated row's own position.
 */
export async function reorderResearchQuestion(
  questionId: string,
  direction: "up" | "down",
): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { data: question } = await supabase
    .from("sw_research_questions")
    .select("id, project_id")
    .eq("id", questionId)
    .maybeSingle();
  if (!question) return { error: "That question no longer exists." };

  const { data: active } = await supabase
    .from("sw_research_questions")
    .select("id, position")
    .eq("project_id", question.project_id)
    .eq("active", true)
    .order("position");

  const list = active ?? [];
  const index = list.findIndex((row) => row.id === questionId);
  const target = index + (direction === "up" ? -1 : 1);
  const moving = list[index];
  const neighbor = list[target];
  if (!moving || !neighbor) return {};

  const [firstUpdate, secondUpdate] = await Promise.all([
    supabase.from("sw_research_questions").update({ position: neighbor.position }).eq("id", moving.id),
    supabase.from("sw_research_questions").update({ position: moving.position }).eq("id", neighbor.id),
  ]);
  if (firstUpdate.error || secondUpdate.error) return { error: "Could not reorder the questions." };

  revalidateResearch(question.project_id);
  return {};
}

// Data points --------------------------------------------------------------

export async function createDataPoint(
  projectId: string,
  summary: string,
  researchQuestionId: string | null,
): Promise<{ id: string } | { error: string }> {
  const { profile } = await assertToolAccess("transcription");
  const trimmed = summary.trim();
  if (!trimmed) return { error: "Give the data point a summary." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sw_data_points")
    .insert({
      project_id: projectId,
      research_question_id: researchQuestionId,
      summary: trimmed,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not create the data point. Please try again." };
  revalidateResearch(projectId);
  return { id: data.id };
}

export async function updateDataPointSummary(
  dataPointId: string,
  summary: string,
): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const trimmed = summary.trim();
  if (!trimmed) return { error: "Give the data point a summary." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sw_data_points")
    .update({ summary: trimmed })
    .eq("id", dataPointId)
    .select("project_id")
    .maybeSingle();

  if (error) return { error: "Could not update the data point." };
  if (!data) return { error: "That data point no longer exists." };

  // Best-effort, never blocks the write — the row is already flagged
  // embedding_stale by a trigger, so a failure here just defers it.
  await embedPendingDataPoints(supabase, data.project_id);
  revalidateResearch(data.project_id);
  return {};
}

export async function setDataPointResearchQuestion(
  dataPointId: string,
  researchQuestionId: string | null,
): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sw_data_points")
    .update({ research_question_id: researchQuestionId })
    .eq("id", dataPointId)
    .select("project_id")
    .maybeSingle();

  if (error) return { error: "Could not update which question this answers." };
  if (!data) return { error: "That data point no longer exists." };

  revalidateResearch(data.project_id);
  return {};
}

export async function deleteDataPoint(dataPointId: string): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { data: dataPoint } = await supabase
    .from("sw_data_points")
    .select("project_id")
    .eq("id", dataPointId)
    .maybeSingle();
  if (!dataPoint) return { error: "That data point no longer exists." };

  const { error } = await supabase.from("sw_data_points").delete().eq("id", dataPointId);
  if (error) return { error: "Could not delete the data point." };

  revalidateResearch(dataPoint.project_id);
  return {};
}

// Grounding excerpts ---------------------------------------------------------

export interface AttachableExcerpt {
  id: string;
  title: string;
  excerpt: string;
  locatorKind: "temporal" | "document";
  sourceTitle: string;
  sourceKind: SwSourceKind;
}

/**
 * Every excerpt this data point could be grounded by — scoped to sources
 * *currently* attached to the data point's own project (§9.3: a data point
 * never reaches outside its project for evidence, unlike Phase 5's themes),
 * excluding whatever is already attached. Reuses listLibraryClips(projectId)
 * unchanged rather than a new read — that's the same set the project's own
 * excerpt library already shows.
 */
export async function listAttachableExcerpts(
  projectId: string,
  dataPointId: string,
): Promise<AttachableExcerpt[]> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const [clips, { data: attached }] = await Promise.all([
    listLibraryClips(projectId),
    supabase.from("sw_data_point_excerpts").select("excerpt_id").eq("data_point_id", dataPointId),
  ]);

  const attachedIds = new Set((attached ?? []).map((row) => row.excerpt_id));
  return clips
    .filter((clip) => !attachedIds.has(clip.id))
    .map((clip) => ({
      id: clip.id,
      title: clip.title,
      excerpt: clip.excerpt,
      locatorKind: clip.locatorKind,
      sourceTitle: clip.sourceTitle,
      sourceKind: clip.sourceKind,
    }));
}

export async function attachExcerptToDataPoint(
  dataPointId: string,
  excerptId: string,
): Promise<{ error?: string }> {
  const { profile } = await assertToolAccess("transcription");
  const supabase = await createClient();

  const { data: dataPoint } = await supabase
    .from("sw_data_points")
    .select("project_id")
    .eq("id", dataPointId)
    .maybeSingle();
  if (!dataPoint) return { error: "That data point no longer exists." };

  const { error } = await supabase
    .from("sw_data_point_excerpts")
    .insert({ data_point_id: dataPointId, excerpt_id: excerptId, added_by: profile.id });
  if (error) return { error: "Could not attach that excerpt." };

  revalidateResearch(dataPoint.project_id);
  return {};
}

export async function detachExcerptFromDataPoint(
  dataPointId: string,
  excerptId: string,
): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { data: dataPoint } = await supabase
    .from("sw_data_points")
    .select("project_id")
    .eq("id", dataPointId)
    .maybeSingle();
  if (!dataPoint) return { error: "That data point no longer exists." };

  const { error } = await supabase
    .from("sw_data_point_excerpts")
    .delete()
    .eq("data_point_id", dataPointId)
    .eq("excerpt_id", excerptId);
  if (error) return { error: "Could not remove that excerpt." };

  revalidateResearch(dataPoint.project_id);
  return {};
}
