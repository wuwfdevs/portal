"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { actionError, actionOk, type ActionResult } from "@/lib/action-response";
import { field } from "@/lib/form-fields";
import { uuidParam } from "@/lib/sourcework/route-input";
import { assignPool, assignQuietly } from "@/lib/sourcework/theme-run";
import { THEME_LIMIT, validateMemo, validateThemeText } from "@/lib/sourcework/themes";
import { projectPath, themePath } from "@/lib/transcription/links";

// Writes behind the Themes tab and the theme page (docs/sourcework-analysis-
// design.md §5.4). Called straight from client components, so they return a
// result instead of redirecting. Any tool member may do all of it — RLS is the
// boundary, these are the courtesy in front — and none of it deletes: a theme
// is rejected, a data point removed from one, a merge declined.

function revalidateTheme(projectId: string, themeId?: string) {
  revalidatePath(projectPath(projectId, "themes"));
  revalidatePath(`/sourcework/${projectId}`);
  if (themeId) revalidatePath(themePath(projectId, themeId));
}

// Themes ------------------------------------------------------------------------------------

export type ThemeDecision = "accept" | "reject" | "undo";

/**
 * Accept keeps a theme, reject hides it (its data points go back to the pool and
 * the title is never proposed again), undo puts a rejected one back for review.
 * Accepting also files the pool's unchecked data points into it, afterwards.
 */
export async function reviewTheme(input: {
  id: string;
  decision: ThemeDecision;
}): Promise<ActionResult> {
  const { profile } = await assertSourceworkContext();
  const id = uuidParam(input.id);
  if (!id || !["accept", "reject", "undo"].includes(input.decision)) {
    return actionError("That theme doesn't exist.");
  }

  const patch =
    input.decision === "accept"
      ? {
          status: "accepted" as const,
          accepted_by: profile.id,
          accepted_at: new Date().toISOString(),
        }
      : { status: input.decision === "reject" ? ("rejected" as const) : ("suggested" as const) };

  const supabase = await createClient();
  const updated = await supabase
    .from("sw_themes")
    .update(patch)
    .eq("id", id)
    .is("merged_into_id", null)
    .select("project_id");
  if (updated.error) {
    console.error("Could not review a theme:", updated.error);
    return actionError("Couldn't save that decision. Try again.");
  }
  const row = updated.data[0];
  if (!row) return actionError("That theme doesn't exist.");

  if (input.decision === "accept") {
    after(() => assignQuietly(() => assignPool({ projectId: row.project_id, userId: profile.id })));
  }
  revalidateTheme(row.project_id, id);
  return actionOk();
}

/**
 * Rewords a theme. Saving an edit of a suggestion is a decision, as it is for a
 * data point: the theme is accepted. Editing an accepted or rejected one only
 * rewords it.
 */
export async function editTheme(input: {
  id: string;
  title: string;
  definition: string;
}): Promise<ActionResult> {
  const { profile } = await assertSourceworkContext();
  const id = uuidParam(input.id);
  if (!id) return actionError("That theme doesn't exist.");
  const text = validateThemeText(input);
  if (!text.ok) return actionError(text.error);

  const supabase = await createClient();
  const current = await supabase
    .from("sw_themes")
    .select("project_id, status")
    .eq("id", id)
    .is("merged_into_id", null)
    .maybeSingle();
  if (current.error) {
    console.error("Could not read a theme:", current.error);
    return actionError("Couldn't save the change. Try again.");
  }
  if (!current.data) return actionError("That theme doesn't exist.");

  const accepting = current.data.status === "suggested";
  const updated = await supabase
    .from("sw_themes")
    .update({
      title: text.title,
      definition: text.definition,
      ...(accepting
        ? {
            status: "accepted" as const,
            accepted_by: profile.id,
            accepted_at: new Date().toISOString(),
          }
        : {}),
    })
    .eq("id", id)
    .is("merged_into_id", null)
    .select("project_id");
  if (updated.error) {
    console.error("Could not edit a theme:", updated.error);
    return actionError("Couldn't save the change. Try again.");
  }
  const row = updated.data[0];
  if (!row) return actionError("That theme doesn't exist.");

  if (accepting) {
    after(() => assignQuietly(() => assignPool({ projectId: row.project_id, userId: profile.id })));
  }
  revalidateTheme(row.project_id, id);
  return actionOk();
}

/** A theme written by hand (§2.8): accepted at once, empty until data points are added or assigned. */
export async function createTheme(input: {
  projectId: string;
  title: string;
  definition: string;
}): Promise<ActionResult<{ id: string }>> {
  const { profile } = await assertSourceworkContext();
  const projectId = uuidParam(input.projectId);
  if (!projectId) return actionError("That project doesn't exist.");
  const text = validateThemeText(input);
  if (!text.ok) return actionError(text.error);

  const supabase = await createClient();
  const live = await supabase
    .from("sw_themes")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .neq("status", "rejected")
    .is("merged_into_id", null);
  if (live.error) {
    console.error("Could not count a project's themes:", live.error);
    return actionError("Couldn't add the theme. Try again.");
  }
  if ((live.count ?? 0) >= THEME_LIMIT) {
    return actionError(
      `A project can have ${THEME_LIMIT} themes at a time. Reject one to add another.`,
    );
  }

  const inserted = await supabase
    .from("sw_themes")
    .insert({
      project_id: projectId,
      title: text.title,
      definition: text.definition,
      status: "accepted",
      origin: "person",
      created_by: profile.id,
      accepted_by: profile.id,
      accepted_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (inserted.error) {
    console.error("Could not add a theme:", inserted.error);
    return actionError("Couldn't add the theme. Try again.");
  }

  after(() => assignQuietly(() => assignPool({ projectId, userId: profile.id })));
  revalidateTheme(projectId);
  return actionOk({ id: inserted.data.id });
}

/** `createTheme` for a plain `<form action>`: on to the new theme, or back to the form with the reason. */
export async function createThemeFromForm(formData: FormData) {
  const projectId = field(formData, "project_id");
  const result = await createTheme({
    projectId,
    title: field(formData, "title"),
    definition: field(formData, "definition"),
  });
  if (!result.ok) {
    redirect(`${projectPath(projectId, "themes")}&new=1&error=${encodeURIComponent(result.error)}`);
  }
  redirect(themePath(projectId, result.id));
}

/** The memo is the reporter's own; no run reads or writes it. */
export async function saveThemeMemo(input: { id: string; memo: string }): Promise<ActionResult> {
  await assertSourceworkContext();
  const id = uuidParam(input.id);
  if (!id) return actionError("That theme doesn't exist.");
  const checked = validateMemo(input.memo);
  if (!checked.ok) return actionError(checked.error);

  const supabase = await createClient();
  const updated = await supabase
    .from("sw_themes")
    .update({ memo: checked.memo })
    .eq("id", id)
    .select("project_id");
  if (updated.error) {
    console.error("Could not save a theme memo:", updated.error);
    return actionError("Couldn't save the memo. Try again.");
  }
  const row = updated.data[0];
  if (!row) return actionError("That theme doesn't exist.");
  revalidateTheme(row.project_id, id);
  return actionOk();
}

// Where a data point sits ---------------------------------------------------------------------

export async function addDataPointToTheme(input: {
  themeId: string;
  dataPointId: string;
  stance: "supports" | "complicates";
}): Promise<ActionResult> {
  await assertSourceworkContext();
  const themeId = uuidParam(input.themeId);
  const dataPointId = uuidParam(input.dataPointId);
  if (!themeId || !dataPointId || (input.stance !== "supports" && input.stance !== "complicates")) {
    return actionError("That data point or theme doesn't exist.");
  }

  const supabase = await createClient();
  const theme = await supabase
    .from("sw_themes")
    .select("project_id")
    .eq("id", themeId)
    .is("merged_into_id", null)
    .maybeSingle();
  if (theme.error || !theme.data) return actionError("That theme doesn't exist.");

  // Also brings back a point someone removed: the row is the same, only its state changes.
  const written = await supabase.from("sw_data_point_themes").upsert(
    {
      data_point_id: dataPointId,
      theme_id: themeId,
      project_id: theme.data.project_id,
      stance: input.stance,
      assigned_by: "person" as const,
      run_id: null,
      removed_at: null,
      removed_by: null,
    },
    { onConflict: "data_point_id,theme_id" },
  );
  if (written.error) {
    console.error("Could not add a data point to a theme:", written.error);
    return actionError("Couldn't add that data point. Try again.");
  }
  revalidateTheme(theme.data.project_id, themeId);
  return actionOk();
}

export async function setDataPointStance(input: {
  themeId: string;
  dataPointId: string;
  stance: "supports" | "complicates";
}): Promise<ActionResult> {
  await assertSourceworkContext();
  const themeId = uuidParam(input.themeId);
  const dataPointId = uuidParam(input.dataPointId);
  if (!themeId || !dataPointId || (input.stance !== "supports" && input.stance !== "complicates")) {
    return actionError("That data point doesn't exist.");
  }
  const supabase = await createClient();
  const updated = await supabase
    .from("sw_data_point_themes")
    .update({ stance: input.stance, assigned_by: "person" })
    .eq("theme_id", themeId)
    .eq("data_point_id", dataPointId)
    .is("removed_at", null)
    .select("project_id");
  if (updated.error) {
    console.error("Could not change a stance:", updated.error);
    return actionError("Couldn't save that. Try again.");
  }
  const row = updated.data[0];
  if (!row) return actionError("That data point isn't in this theme.");
  revalidateTheme(row.project_id, themeId);
  return actionOk();
}

/** Takes a data point out of a theme. The row stays, marked removed, so a later run doesn't put it straight back. */
export async function removeDataPointFromTheme(input: {
  themeId: string;
  dataPointId: string;
}): Promise<ActionResult> {
  const { profile } = await assertSourceworkContext();
  const themeId = uuidParam(input.themeId);
  const dataPointId = uuidParam(input.dataPointId);
  if (!themeId || !dataPointId) return actionError("That data point doesn't exist.");
  const supabase = await createClient();
  const updated = await supabase
    .from("sw_data_point_themes")
    .update({ removed_at: new Date().toISOString(), removed_by: profile.id })
    .eq("theme_id", themeId)
    .eq("data_point_id", dataPointId)
    .is("removed_at", null)
    .select("project_id");
  if (updated.error) {
    console.error("Could not remove a data point from a theme:", updated.error);
    return actionError("Couldn't remove it. Try again.");
  }
  const row = updated.data[0];
  if (!row) return actionError("That data point isn't in this theme.");
  revalidateTheme(row.project_id, themeId);
  return actionOk();
}

// Merges --------------------------------------------------------------------------------------------

export async function decideMerge(input: {
  id: string;
  decision: "accept" | "reject";
}): Promise<ActionResult> {
  const { profile } = await assertSourceworkContext();
  const id = uuidParam(input.id);
  if (!id || (input.decision !== "accept" && input.decision !== "reject")) {
    return actionError("That suggestion doesn't exist.");
  }
  const supabase = await createClient();

  const suggestion = await supabase
    .from("sw_theme_merge_suggestions")
    .select("project_id")
    .eq("id", id)
    .maybeSingle();
  if (suggestion.error || !suggestion.data) return actionError("That suggestion doesn't exist.");
  const projectId = suggestion.data.project_id;

  if (input.decision === "reject") {
    const rejected = await supabase
      .from("sw_theme_merge_suggestions")
      .update({ status: "rejected", decided_by: profile.id, decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "suggested");
    if (rejected.error) {
      console.error("Could not decline a merge:", rejected.error);
      return actionError("Couldn't save that decision. Try again.");
    }
    revalidateTheme(projectId);
    return actionOk();
  }

  const merged = await supabase.rpc("sw_merge_themes", { p_suggestion_id: id });
  if (merged.error) {
    console.error("Could not merge themes:", merged.error);
    return actionError("Couldn't merge those themes. Try again.");
  }
  revalidateTheme(projectId);
  switch (merged.data) {
    case "merged":
      return actionOk();
    case "decided":
      return actionError("That suggestion was already decided.");
    case "stale":
      return actionError(
        "One of those themes has changed since it was suggested, so it can't be merged.",
      );
    default:
      return actionError("That suggestion doesn't exist.");
  }
}
