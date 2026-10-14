"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { actionError, actionOk, type ActionResult } from "@/lib/action-response";
import { uuidParam } from "@/lib/sourcework/route-input";
import { getCurrentSynthesis } from "@/lib/sourcework/synthesis-queries";
import type { SynthesisBody } from "@/lib/sourcework/synthesis";
import {
  dismissTheme,
  gapQuestionText,
  restoreTheme,
  themeQuestionText,
  trackGap,
  trackTheme,
} from "@/lib/sourcework/synthesis-edit";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { addResearchQuestion } from "../research-actions";

// A person's changes to the Synthesis tab. Each is saved as a new, insert-only version
// (`sw_save_project_synthesis`, saved_via "person") on top of the version the person was looking at,
// so it never overwrites a run that finished meanwhile. Any tool member may do all of it; RLS is the
// boundary and these are the courtesy in front.

const CONFLICT =
  "The synthesis changed while you were looking at it. Reload the page and try again.";

/**
 * Saves `edit(body)` as the next version. `expectVersion` is the version the page showed: if the
 * project has moved on, nothing is saved.
 */
async function saveEdit(
  projectId: string,
  expectVersion: number,
  edit: (body: SynthesisBody) => SynthesisBody | null,
): Promise<ActionResult<{ unchanged?: boolean }>> {
  const current = await getCurrentSynthesis(projectId);
  if (!current || current.version !== expectVersion) return actionError(CONFLICT);
  const next = edit(current.body);
  if (!next) return actionOk({ unchanged: true });

  const supabase = await createClient();
  const saved = await supabase.rpc("sw_save_project_synthesis", {
    p_project_id: projectId,
    p_base_version: current.version,
    p_body: next as never,
    p_saved_via: "person",
    p_run_id: null as never,
    p_prompt_version_id: null as never,
  });
  if (saved.error) {
    console.error("Could not save the synthesis:", saved.error);
    return actionError("Couldn't save that. Try again.");
  }
  if (saved.data === -1) return actionError(CONFLICT);
  revalidatePath(`/sourcework/${projectId}`);
  return actionOk();
}

/** Turns a pattern or an open point into a research question the next Analyze listens for, and marks it tracked. */
export async function trackSynthesisItem(input: {
  projectId: string;
  expectVersion: number;
  kind: "theme" | "gap";
  itemId: string;
  /** The theme's label, or the gap's text: what the question is made from. */
  text: string;
}): Promise<ActionResult> {
  await assertSourceworkContext();
  const projectId = uuidParam(input.projectId);
  if (!projectId || !input.itemId) return actionError("That project doesn't exist.");

  // Look first: a second click on a tracked item must not add a second question.
  const current = await getCurrentSynthesis(projectId);
  if (!current || current.version !== input.expectVersion) return actionError(CONFLICT);
  const already =
    input.kind === "theme"
      ? current.body.emerging.some((t) => t.id === input.itemId && t.status === "tracking")
      : current.body.sections.some((s) =>
          s.gaps.some((g) => g.id === input.itemId && g.questionId),
        );
  if (already) return actionOk();

  const added = await addResearchQuestion({
    projectId,
    question: input.kind === "theme" ? themeQuestionText(input.text) : gapQuestionText(input.text),
  });
  if (!added.ok) return added;

  const saved = await saveEdit(projectId, input.expectVersion, (body) =>
    input.kind === "theme"
      ? trackTheme(body, input.itemId, added.id)
      : trackGap(body, input.itemId, added.id),
  );
  if (!saved.ok) {
    return actionError(
      `The question was added on the Setup tab, but it couldn't be marked here. ${saved.error}`,
    );
  }
  return actionOk();
}

export async function setThemeDismissed(input: {
  projectId: string;
  expectVersion: number;
  themeId: string;
  dismissed: boolean;
}): Promise<ActionResult> {
  await assertSourceworkContext();
  const projectId = uuidParam(input.projectId);
  if (!projectId) return actionError("That project doesn't exist.");
  const saved = await saveEdit(projectId, input.expectVersion, (body) =>
    input.dismissed ? dismissTheme(body, input.themeId) : restoreTheme(body, input.themeId),
  );
  return saved.ok ? actionOk() : saved;
}

/**
 * A short-lived URL to play a source's recording inside the evidence panel. Null for a document or a
 * source whose file isn't ready. Only a source of this project is served.
 */
export async function getEvidenceMediaUrl(input: {
  projectId: string;
  sourceId: string;
}): Promise<ActionResult<{ url: string }>> {
  await assertSourceworkContext();
  const projectId = uuidParam(input.projectId);
  const sourceId = uuidParam(input.sourceId);
  if (!projectId || !sourceId) return actionError("That recording doesn't exist.");

  const supabase = await createClient();
  const [link, source] = await Promise.all([
    supabase
      .from("sw_project_sources")
      .select("source_id")
      .eq("project_id", projectId)
      .eq("source_id", sourceId)
      .maybeSingle(),
    supabase
      .from("sw_sources")
      .select("kind, original_storage_path, status")
      .eq("id", sourceId)
      .maybeSingle(),
  ]);
  if (link.error || source.error) {
    console.error("Could not read the recording:", link.error ?? source.error);
    return actionError("Couldn't load the recording. Try again.");
  }
  const row = source.data;
  if (!link.data || !row || !row.original_storage_path || row.kind === "document") {
    return actionError("This source has no recording to play here.");
  }
  const url = await getSignedMediaUrl(row.original_storage_path);
  if (!url) return actionError("Couldn't load the recording. Try again.");
  return actionOk({ url });
}
