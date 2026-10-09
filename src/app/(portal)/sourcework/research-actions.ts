"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertSourceworkContext } from "@/lib/sourcework/access";
import { actionError, actionOk, type ActionResult } from "@/lib/action-response";
import { collapseWhitespace } from "@/lib/text";
import {
  CLAIM_MAX,
  QUESTION_LIMIT,
  QUESTION_MAX,
  compareQuestions,
  moveAmongActive,
} from "@/lib/sourcework/research";
import { uuidParam } from "@/lib/sourcework/route-input";

// Writes behind the research screens (docs/sourcework-analysis-design.md):
// questions, background notes, and the review of data points. Called straight
// from client components, so they return a result instead of redirecting. Any
// tool member may do all of it — RLS is the boundary, these are the courtesy
// in front — and none of it deletes: a question is archived, a note dismissed,
// a data point rejected, and each can be brought back.

function revalidateProject(projectId: string) {
  revalidatePath(`/sourcework/${projectId}`);
}

function revalidateSource(projectId: string, sourceId: string) {
  revalidatePath(`/sourcework/sources/${sourceId}`);
  revalidateProject(projectId);
}

// Questions ---------------------------------------------------------------------------

function validQuestionText(
  raw: unknown,
): { ok: true; text: string } | { ok: false; error: string } {
  const text = typeof raw === "string" ? collapseWhitespace(raw) : "";
  if (text === "") return { ok: false, error: "Write the question first." };
  if (text.length > QUESTION_MAX) {
    return { ok: false, error: `Keep a question under ${QUESTION_MAX} characters.` };
  }
  return { ok: true, text };
}

export async function addResearchQuestion(input: {
  projectId: string;
  question: string;
}): Promise<ActionResult<{ id: string }>> {
  const { profile } = await assertSourceworkContext();
  const projectId = uuidParam(input.projectId);
  if (!projectId) return actionError("That project doesn't exist.");
  const checked = validQuestionText(input.question);
  if (!checked.ok) return actionError(checked.error);

  const supabase = await createClient();
  const existing = await supabase
    .from("sw_research_questions")
    .select("position, archived_at")
    .eq("project_id", projectId);
  if (existing.error) {
    console.error("Could not read the research questions:", existing.error);
    return actionError("Couldn't add the question. Try again.");
  }
  const active = existing.data.filter((row) => row.archived_at === null).length;
  if (active >= QUESTION_LIMIT) {
    return actionError(
      `A project can have ${QUESTION_LIMIT} questions at a time. Archive one to add another.`,
    );
  }
  const position = existing.data.reduce((max, row) => Math.max(max, row.position + 1), 0);

  const inserted = await supabase
    .from("sw_research_questions")
    .insert({ project_id: projectId, question: checked.text, position, created_by: profile.id })
    .select("id")
    .single();
  if (inserted.error) {
    console.error("Could not add a research question:", inserted.error);
    return actionError("Couldn't add the question. Try again.");
  }
  revalidateProject(projectId);
  return actionOk({ id: inserted.data.id });
}

export async function updateResearchQuestion(input: {
  id: string;
  question: string;
}): Promise<ActionResult> {
  await assertSourceworkContext();
  const id = uuidParam(input.id);
  if (!id) return actionError("That question doesn't exist.");
  const checked = validQuestionText(input.question);
  if (!checked.ok) return actionError(checked.error);

  const supabase = await createClient();
  const updated = await supabase
    .from("sw_research_questions")
    .update({ question: checked.text })
    .eq("id", id)
    .select("project_id");
  if (updated.error) {
    console.error("Could not update a research question:", updated.error);
    return actionError("Couldn't save the question. Try again.");
  }
  const row = updated.data[0];
  if (!row) return actionError("That question doesn't exist.");
  revalidateProject(row.project_id);
  return actionOk();
}

export async function moveResearchQuestion(input: {
  id: string;
  direction: "up" | "down";
}): Promise<ActionResult> {
  await assertSourceworkContext();
  const id = uuidParam(input.id);
  if (!id || (input.direction !== "up" && input.direction !== "down")) {
    return actionError("That question doesn't exist.");
  }
  const supabase = await createClient();

  const target = await supabase
    .from("sw_research_questions")
    .select("project_id")
    .eq("id", id)
    .maybeSingle();
  if (target.error || !target.data) return actionError("That question doesn't exist.");
  const projectId = target.data.project_id;

  const all = await supabase
    .from("sw_research_questions")
    .select("id, position, created_at, archived_at")
    .eq("project_id", projectId);
  if (all.error) {
    console.error("Could not read the research questions:", all.error);
    return actionError("Couldn't move the question. Try again.");
  }
  const ordered = all.data
    .map((row) => ({
      id: row.id,
      position: row.position,
      createdAt: row.created_at,
      archived: row.archived_at !== null,
    }))
    .sort(compareQuestions);
  const nextOrder = moveAmongActive(ordered, id, input.direction);
  if (!nextOrder) return actionOk();

  const byId = new Map(ordered.map((question) => [question.id, question]));
  const changes = nextOrder
    .map((questionId, position) => ({ questionId, position }))
    .filter(({ questionId, position }) => byId.get(questionId)?.position !== position);
  const results = await Promise.all(
    changes.map(({ questionId, position }) =>
      supabase.from("sw_research_questions").update({ position }).eq("id", questionId),
    ),
  );
  if (results.some((result) => result.error)) {
    console.error(
      "Could not reorder research questions:",
      results.map((r) => r.error),
    );
    return actionError("Couldn't move the question. Try again.");
  }
  revalidateProject(projectId);
  return actionOk();
}

export async function setResearchQuestionArchived(input: {
  id: string;
  archived: boolean;
}): Promise<ActionResult> {
  await assertSourceworkContext();
  const id = uuidParam(input.id);
  if (!id) return actionError("That question doesn't exist.");

  const supabase = await createClient();
  const updated = await supabase
    .from("sw_research_questions")
    .update({ archived_at: input.archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("project_id");
  if (updated.error) {
    console.error("Could not archive a research question:", updated.error);
    return actionError("Couldn't update the question. Try again.");
  }
  const row = updated.data[0];
  if (!row) return actionError("That question doesn't exist.");
  revalidateProject(row.project_id);
  return actionOk();
}

// Background notes ------------------------------------------------------------------------

export async function setContextNoteDismissed(input: {
  id: string;
  dismissed: boolean;
}): Promise<ActionResult> {
  await assertSourceworkContext();
  const id = uuidParam(input.id);
  if (!id) return actionError("That note doesn't exist.");

  const supabase = await createClient();
  const updated = await supabase
    .from("sw_context_notes")
    .update({ status: input.dismissed ? "dismissed" : "active" })
    .eq("id", id)
    .select("project_id");
  if (updated.error) {
    console.error("Could not update a background note:", updated.error);
    return actionError("Couldn't update the note. Try again.");
  }
  const row = updated.data[0];
  if (!row) return actionError("That note doesn't exist.");
  revalidateProject(row.project_id);
  return actionOk();
}

// Data points --------------------------------------------------------------------------------

export type DataPointDecision = "accept" | "reject" | "undo";

const STATUS_FOR: Record<DataPointDecision, "accepted" | "rejected" | "suggested"> = {
  accept: "accepted",
  reject: "rejected",
  undo: "suggested",
};

/** Accept, reject, or put back for review. A decision is never a deletion. */
export async function reviewDataPoint(input: {
  id: string;
  decision: DataPointDecision;
}): Promise<ActionResult> {
  await assertSourceworkContext();
  const id = uuidParam(input.id);
  const status = STATUS_FOR[input.decision];
  if (!id || !status) return actionError("That data point doesn't exist.");

  const supabase = await createClient();
  const updated = await supabase
    .from("sw_data_points")
    .update({ status })
    .eq("id", id)
    .select("project_id, source_id");
  if (updated.error) {
    console.error("Could not review a data point:", updated.error);
    return actionError("Couldn't save that decision. Try again.");
  }
  const row = updated.data[0];
  if (!row) return actionError("That data point doesn't exist.");
  revalidateSource(row.project_id, row.source_id);
  return actionOk();
}

/**
 * Rewords a claim. Saving an edit is a decision: the point is accepted, and the
 * model's own wording stays in `ai_claim`.
 */
export async function editDataPoint(input: { id: string; claim: string }): Promise<ActionResult> {
  await assertSourceworkContext();
  const id = uuidParam(input.id);
  if (!id) return actionError("That data point doesn't exist.");
  const claim = typeof input.claim === "string" ? collapseWhitespace(input.claim) : "";
  if (claim === "") return actionError("A data point needs some words.");
  if (claim.length > CLAIM_MAX)
    return actionError(`Keep a data point under ${CLAIM_MAX} characters.`);

  const supabase = await createClient();
  const updated = await supabase
    .from("sw_data_points")
    .update({ claim, status: "accepted" })
    .eq("id", id)
    .select("project_id, source_id");
  if (updated.error) {
    console.error("Could not edit a data point:", updated.error);
    return actionError("Couldn't save the change. Try again.");
  }
  const row = updated.data[0];
  if (!row) return actionError("That data point doesn't exist.");
  revalidateSource(row.project_id, row.source_id);
  return actionOk();
}
