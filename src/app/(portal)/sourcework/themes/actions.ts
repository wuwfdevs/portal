"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { wouldCreateThemeCycle } from "@/lib/transcription/theme-hierarchy";

// Sourcework Phase 5 (docs/sourcework-analysis-design.md): themes group
// Phase 4 data points into a pattern, optionally nested under a parent
// theme, optionally answering one research question. Same shared-workspace
// trust model as the rest of Sourcework — any tool member can create, edit,
// or reorganize any theme.

function revalidateThemes(themeId?: string) {
  revalidatePath("/sourcework");
  if (themeId) revalidatePath(`/sourcework/themes/${themeId}`);
}

export async function createTheme(title: string): Promise<{ id: string } | { error: string }> {
  const { profile } = await assertToolAccess("transcription");
  const trimmed = title.trim();
  if (!trimmed) return { error: "Give the theme a title." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sw_themes")
    .insert({ title: trimmed, created_by: profile.id })
    .select("id")
    .single();

  if (error || !data) return { error: "Could not create the theme. Please try again." };
  revalidateThemes();
  return { id: data.id };
}

export async function updateTheme(
  themeId: string,
  title: string,
  notes: string,
): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return { error: "Give the theme a title." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("sw_themes")
    .update({ title: trimmedTitle, notes: notes.trim() || null })
    .eq("id", themeId);

  if (error) return { error: "Could not update the theme." };
  revalidateThemes(themeId);
  return {};
}

/**
 * Groups a theme under a parent (or clears it with parentThemeId = null).
 * Rejects a cycle — a theme becoming its own ancestor — by checking against
 * every theme's current parent, not just the immediate pair (§5's "excluding
 * itself and its own descendants").
 */
export async function setThemeParent(
  themeId: string,
  parentThemeId: string | null,
): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  if (parentThemeId) {
    const { data: allThemes } = await supabase.from("sw_themes").select("id, parent_theme_id");
    const parentByThemeId = new Map((allThemes ?? []).map((theme) => [theme.id, theme.parent_theme_id]));
    if (wouldCreateThemeCycle(themeId, parentThemeId, parentByThemeId)) {
      return { error: "That would nest this theme under one of its own descendants." };
    }
  }

  const { error } = await supabase
    .from("sw_themes")
    .update({ parent_theme_id: parentThemeId })
    .eq("id", themeId);

  if (error) return { error: "Could not regroup the theme." };
  revalidateThemes(themeId);
  return {};
}

export async function setThemeResearchQuestion(
  themeId: string,
  researchQuestionId: string | null,
): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { error } = await supabase
    .from("sw_themes")
    .update({ research_question_id: researchQuestionId })
    .eq("id", themeId);

  if (error) return { error: "Could not update which question this theme answers." };
  revalidateThemes(themeId);
  return {};
}

/**
 * Deleting a theme is irreversible and can orphan a hierarchy (its children
 * fall back to top-level — sw_themes.parent_theme_id is "on delete set
 * null"), so the confirmation step lives client-side before this is ever
 * called — see docs/sourcework-analysis-design.md §9's now-resolved open
 * question #4.
 */
export async function deleteTheme(themeId: string): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { error } = await supabase.from("sw_themes").delete().eq("id", themeId);
  if (error) return { error: "Could not delete the theme." };

  revalidateThemes();
  return {};
}

export async function attachDataPointToTheme(
  themeId: string,
  dataPointId: string,
): Promise<{ error?: string }> {
  const { profile } = await assertToolAccess("transcription");
  const supabase = await createClient();

  const { error } = await supabase
    .from("sw_theme_data_points")
    .insert({ theme_id: themeId, data_point_id: dataPointId, added_by: profile.id });
  if (error) return { error: "Could not attach that data point." };

  revalidateThemes(themeId);
  return {};
}

export async function detachDataPointFromTheme(
  themeId: string,
  dataPointId: string,
): Promise<{ error?: string }> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { error } = await supabase
    .from("sw_theme_data_points")
    .delete()
    .eq("theme_id", themeId)
    .eq("data_point_id", dataPointId);
  if (error) return { error: "Could not remove that data point." };

  revalidateThemes(themeId);
  return {};
}

export interface AttachableDataPoint {
  id: string;
  summary: string;
  projectTitle: string;
}

/**
 * Every data point across every project the caller can see, excluding ones
 * already attached to this theme — the tool-wide counterpart to Phase 4's
 * project-scoped listAttachableExcerpts (§5: "a theme's whole purpose can
 * be connecting data points across projects"). Server-side ilike filter,
 * matching listAttachableSources' pattern — this pool can be tool-wide, so
 * unlike Phase 4's client-filtered excerpt picker it isn't safe to assume
 * it's small.
 */
export async function listAttachableDataPoints(
  themeId: string,
  query: string,
): Promise<AttachableDataPoint[]> {
  await assertToolAccess("transcription");
  const supabase = await createClient();

  const { data: attached } = await supabase
    .from("sw_theme_data_points")
    .select("data_point_id")
    .eq("theme_id", themeId);
  const attachedIds = new Set((attached ?? []).map((row) => row.data_point_id));

  let dataPointQuery = supabase
    .from("sw_data_points")
    .select("id, summary, project_id")
    .order("created_at", { ascending: false })
    .limit(50);
  const trimmed = query.trim();
  if (trimmed) dataPointQuery = dataPointQuery.ilike("summary", `%${trimmed}%`);

  const { data, error } = await dataPointQuery;
  if (error) return [];

  const candidates = (data ?? []).filter((row) => !attachedIds.has(row.id));
  if (candidates.length === 0) return [];

  const projectIds = [...new Set(candidates.map((row) => row.project_id))];
  const { data: projects } = await supabase.from("tw_projects").select("id, title").in("id", projectIds);
  const projectTitleById = new Map((projects ?? []).map((project) => [project.id, project.title]));

  return candidates.map((row) => ({
    id: row.id,
    summary: row.summary,
    projectTitle: projectTitleById.get(row.project_id) ?? "Unknown project",
  }));
}
