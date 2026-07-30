"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import { logAuditEvent } from "@/lib/audit";
import { generatePublicId } from "@/lib/audience-listening/public-id";
import { DEFAULT_MAX_DURATION_SECONDS } from "@/lib/audience-listening/media";
import {
  reorderPositions,
  validateQueryInput,
  validateQuestionInput,
} from "@/lib/audience-listening/query-state";
import { listQuestions } from "@/lib/audience-listening/queries";
import { sendAnswerToTranscription, sendQueuedAnswers } from "@/lib/audience-listening/handoff";
import type { AlFieldMode, AlQueryStatus, AlReviewState } from "@/lib/database.types";

const LIST_PATH = "/audience-listening";

function queryPath(queryId: string, tab?: string): string {
  return tab ? `${LIST_PATH}/${queryId}?tab=${tab}` : `${LIST_PATH}/${queryId}`;
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function fieldMode(formData: FormData, name: string): AlFieldMode {
  const value = field(formData, name);
  return value === "hidden" || value === "required" ? value : "optional";
}

/** `datetime-local` gives "2026-08-01T09:00"; Postgres wants null or a timestamp. */
function timestamp(formData: FormData, name: string): string | null {
  const value = field(formData, name);
  return value ? new Date(value).toISOString() : null;
}

export async function createQuery(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("audience-listening");
  const newPath = `${LIST_PATH}/new`;

  const internalTitle = field(formData, "internal_title");
  const publicTitle = field(formData, "public_title");
  const problem = validateQueryInput({ internalTitle, publicTitle });
  if (problem) failWith(newPath, problem);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("al_queries")
    .insert({
      public_id: generatePublicId(),
      internal_title: internalTitle,
      public_title: publicTitle,
      public_intro: field(formData, "public_intro"),
      internal_notes: field(formData, "internal_notes") || null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  failIfError(error, newPath, "Could not create the query");
  if (!data) failWith(newPath, "Could not create the query — no row was created.");

  await logAuditEvent({
    actorId: profile.id,
    action: "al.query.created",
    targetType: "al_query",
    targetId: data.id,
    metadata: { internal_title: internalTitle },
  });

  redirect(queryPath(data.id, "questions"));
}

/**
 * The Settings tab, saved as one form: participant fields, consent and
 * attribution, the publication window, and transcription behaviour. Kept
 * together because a reporter reasons about them together — "what am I asking
 * for, what am I promising, and when is it live".
 */
export async function updateQuerySettings(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("audience-listening");
  const queryId = field(formData, "query_id");
  const path = queryPath(queryId, "settings");

  const internalTitle = field(formData, "internal_title");
  const publicTitle = field(formData, "public_title");
  const opensAt = timestamp(formData, "opens_at");
  const closesAt = timestamp(formData, "closes_at");

  const problem = validateQueryInput({ internalTitle, publicTitle, opensAt, closesAt });
  if (problem) failWith(path, problem);

  const consentText = field(formData, "consent_text");
  if (!consentText) failWith(path, "The consent text can't be empty.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("al_queries")
    .update({
      internal_title: internalTitle,
      public_title: publicTitle,
      public_intro: field(formData, "public_intro"),
      internal_notes: field(formData, "internal_notes") || null,
      opens_at: opensAt,
      closes_at: closesAt,
      field_name: fieldMode(formData, "field_name"),
      field_email: fieldMode(formData, "field_email"),
      field_phone: fieldMode(formData, "field_phone"),
      field_city: fieldMode(formData, "field_city"),
      field_note: fieldMode(formData, "field_note"),
      consent_text: consentText,
      ask_contact_permission: formData.get("ask_contact_permission") === "on",
      ask_attribution_permission: formData.get("ask_attribution_permission") === "on",
      allow_anonymous_request: formData.get("allow_anonymous_request") === "on",
      transcription_mode:
        field(formData, "transcription_mode") === "automatic" ? "automatic" : "manual",
    })
    .eq("id", queryId);
  failIfError(error, path, "Could not save the settings");

  await logAuditEvent({
    actorId: profile.id,
    action: "al.query.settings_updated",
    targetType: "al_query",
    targetId: queryId,
  });

  redirect(path);
}

/**
 * Opening, closing, reopening, archiving. Opening is refused for a query with
 * no questions — a live public page with nothing to answer is worse than a
 * draft, and the public route would have nothing to render.
 */
export async function setQueryStatus(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("audience-listening");
  const queryId = field(formData, "query_id");
  const path = queryPath(queryId);
  const status = field(formData, "status") as AlQueryStatus;

  if (!["draft", "open", "closed", "archived"].includes(status)) {
    failWith(path, "That isn't a status this query can be in.");
  }

  if (status === "open") {
    const questions = await listQuestions(queryId);
    if (questions.length === 0) {
      failWith(
        queryPath(queryId, "questions"),
        "Add at least one question before opening the query.",
      );
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("al_queries").update({ status }).eq("id", queryId);
  failIfError(error, path, "Could not change the query's status");

  await logAuditEvent({
    actorId: profile.id,
    action: `al.query.${status}`,
    targetType: "al_query",
    targetId: queryId,
  });

  redirect(path);
}

/**
 * Deleting a query is only for one that was never used. Anything with a
 * submission is archived instead: a delete cascades a participant's answers
 * away, and nothing in this tool destroys a response someone recorded.
 */
export async function deleteQuery(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("audience-listening");
  const queryId = field(formData, "query_id");
  const path = queryPath(queryId, "settings");

  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("al_submissions")
    .select("id", { count: "exact", head: true })
    .eq("query_id", queryId);
  failIfError(countError, path, "Could not check this query's submissions");

  if ((count ?? 0) > 0) {
    failWith(path, "This query has submissions. Archive it instead — deleting would destroy them.");
  }

  const { error } = await supabase.from("al_queries").delete().eq("id", queryId);
  failIfError(error, path, "Could not delete the query");

  await logAuditEvent({
    actorId: profile.id,
    action: "al.query.deleted",
    targetType: "al_query",
    targetId: queryId,
  });

  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

// Questions ---------------------------------------------------------------------

function questionInput(formData: FormData): {
  prompt: string;
  guidance: string | null;
  internalContext: string | null;
  required: boolean;
  maxDurationSeconds: number;
} {
  const raw = Number(field(formData, "max_duration_seconds"));
  return {
    prompt: field(formData, "prompt"),
    guidance: field(formData, "guidance") || null,
    internalContext: field(formData, "internal_context") || null,
    required: formData.get("required") === "on",
    maxDurationSeconds: Number.isFinite(raw) ? Math.round(raw) : DEFAULT_MAX_DURATION_SECONDS,
  };
}

export async function addQuestion(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("audience-listening");
  const queryId = field(formData, "query_id");
  const path = queryPath(queryId, "questions");

  const input = questionInput(formData);
  const problem = validateQuestionInput(input);
  if (problem) failWith(path, problem);

  const existing = await listQuestions(queryId);
  const supabase = await createClient();
  const { error } = await supabase.from("al_questions").insert({
    query_id: queryId,
    position: existing.length + 1,
    prompt: input.prompt,
    guidance: input.guidance,
    internal_context: input.internalContext,
    required: input.required,
    max_duration_seconds: input.maxDurationSeconds,
  });
  // The five-question ceiling is a database trigger, so this is where a sixth
  // question surfaces — as the trigger's own message, which already says it.
  failIfError(error, path, "Could not add the question");

  await logAuditEvent({
    actorId: profile.id,
    action: "al.question.added",
    targetType: "al_query",
    targetId: queryId,
  });

  redirect(path);
}

export async function updateQuestion(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("audience-listening");
  const queryId = field(formData, "query_id");
  const questionId = field(formData, "question_id");
  const path = queryPath(queryId, "questions");

  const input = questionInput(formData);
  const problem = validateQuestionInput(input);
  if (problem) failWith(path, problem);

  const supabase = await createClient();
  const { error } = await supabase
    .from("al_questions")
    .update({
      prompt: input.prompt,
      guidance: input.guidance,
      internal_context: input.internalContext,
      required: input.required,
      max_duration_seconds: input.maxDurationSeconds,
    })
    .eq("id", questionId)
    .eq("query_id", queryId);
  failIfError(error, path, "Could not save the question");

  await logAuditEvent({
    actorId: profile.id,
    action: "al.question.updated",
    targetType: "al_question",
    targetId: questionId,
    metadata: { query_id: queryId },
  });

  redirect(path);
}

export async function duplicateQuestion(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("audience-listening");
  const queryId = field(formData, "query_id");
  const questionId = field(formData, "question_id");
  const path = queryPath(queryId, "questions");

  const questions = await listQuestions(queryId);
  const source = questions.find((question) => question.id === questionId);
  if (!source) failWith(path, "That question no longer exists.");

  const supabase = await createClient();
  const { error } = await supabase.from("al_questions").insert({
    query_id: queryId,
    position: questions.length + 1,
    prompt: source.prompt,
    guidance: source.guidance,
    internal_context: source.internal_context,
    required: source.required,
    max_duration_seconds: source.max_duration_seconds,
  });
  failIfError(error, path, "Could not duplicate the question");

  await logAuditEvent({
    actorId: profile.id,
    action: "al.question.duplicated",
    targetType: "al_question",
    targetId: questionId,
    metadata: { query_id: queryId },
  });

  redirect(path);
}

/**
 * Removing a question is only possible before any submission exists. After
 * that, an answer would be left pointing at nothing and the reporter would have
 * no way to tell what a historical response was answering — which is the whole
 * reason answers snapshot their question in the first place.
 */
export async function deleteQuestion(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("audience-listening");
  const queryId = field(formData, "query_id");
  const questionId = field(formData, "question_id");
  const path = queryPath(queryId, "questions");

  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("al_submissions")
    .select("id", { count: "exact", head: true })
    .eq("query_id", queryId);
  failIfError(countError, path, "Could not check this query's submissions");

  if ((count ?? 0) > 0) {
    failWith(
      path,
      "This query has submissions, so questions can no longer be removed. Existing answers keep the exact question they were asked.",
    );
  }

  const { error } = await supabase
    .from("al_questions")
    .delete()
    .eq("id", questionId)
    .eq("query_id", queryId);
  failIfError(error, path, "Could not remove the question");

  await renumberQuestions(queryId);

  await logAuditEvent({
    actorId: profile.id,
    action: "al.question.removed",
    targetType: "al_question",
    targetId: questionId,
    metadata: { query_id: queryId },
  });

  redirect(path);
}

/**
 * Takes the query id as a bound argument rather than a hidden field, so the
 * shared <ReorderButtons> component (which renders only the id and direction)
 * can be reused as-is instead of gaining a third prop for one caller.
 */
export async function moveQuestion(queryId: string, formData: FormData): Promise<void> {
  await assertToolAccess("audience-listening");
  const questionId = field(formData, "question_id");
  const direction = field(formData, "direction") === "up" ? "up" : "down";
  const path = queryPath(queryId, "questions");

  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("al_submissions")
    .select("id", { count: "exact", head: true })
    .eq("query_id", queryId);
  failIfError(countError, path, "Could not check this query's submissions");
  if ((count ?? 0) > 0) {
    failWith(path, "This query has submissions, so questions can no longer be reordered.");
  }

  const questions = await listQuestions(queryId);
  const reordered = reorderPositions(questions, questionId, direction);

  for (const question of reordered) {
    const before = questions.find((existing) => existing.id === question.id);
    if (before && before.position !== question.position) {
      const { error } = await supabase
        .from("al_questions")
        .update({ position: question.position })
        .eq("id", question.id);
      failIfError(error, path, "Could not reorder the questions");
    }
  }

  redirect(path);
}

/** Closes the gap left by a removal so positions stay 1..n. */
async function renumberQuestions(queryId: string): Promise<void> {
  const supabase = await createClient();
  const questions = await listQuestions(queryId);
  for (const [index, question] of questions.entries()) {
    if (question.position !== index + 1) {
      await supabase
        .from("al_questions")
        .update({ position: index + 1 })
        .eq("id", question.id);
    }
  }
}

// Review ------------------------------------------------------------------------

function reviewState(formData: FormData, name: string): AlReviewState {
  const value = field(formData, name);
  return (["new", "reviewed", "flagged", "rejected"] as string[]).includes(value)
    ? (value as AlReviewState)
    : "new";
}

export async function setSubmissionReview(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("audience-listening");
  const queryId = field(formData, "query_id");
  const submissionId = field(formData, "submission_id");
  const path = `${LIST_PATH}/${queryId}/submissions/${submissionId}`;
  const state = reviewState(formData, "review_state");

  const supabase = await createClient();
  const { error } = await supabase
    .from("al_submissions")
    .update({
      review_state: state,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId);
  failIfError(error, path, "Could not update the review state");

  await logAuditEvent({
    actorId: profile.id,
    action: "al.submission.reviewed",
    targetType: "al_submission",
    targetId: submissionId,
    metadata: { query_id: queryId, review_state: state },
  });

  redirect(path);
}

export async function saveSubmissionNotes(formData: FormData): Promise<void> {
  await assertToolAccess("audience-listening");
  const queryId = field(formData, "query_id");
  const submissionId = field(formData, "submission_id");
  const path = `${LIST_PATH}/${queryId}/submissions/${submissionId}`;

  const supabase = await createClient();
  const { error } = await supabase
    .from("al_submissions")
    .update({ internal_notes: field(formData, "internal_notes") || null })
    .eq("id", submissionId);
  failIfError(error, path, "Could not save the note");

  redirect(path);
}

export async function setAnswerReview(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("audience-listening");
  const queryId = field(formData, "query_id");
  const submissionId = field(formData, "submission_id");
  const answerId = field(formData, "answer_id");
  const path = `${LIST_PATH}/${queryId}/submissions/${submissionId}`;
  const state = reviewState(formData, "review_state");

  const supabase = await createClient();
  const { error } = await supabase
    .from("al_answers")
    .update({ review_state: state })
    .eq("id", answerId);
  failIfError(error, path, "Could not update the answer's review state");

  await logAuditEvent({
    actorId: profile.id,
    action: "al.answer.reviewed",
    targetType: "al_answer",
    targetId: answerId,
    metadata: { query_id: queryId, review_state: state },
  });

  redirect(path);
}

export async function saveAnswerNote(formData: FormData): Promise<void> {
  await assertToolAccess("audience-listening");
  const queryId = field(formData, "query_id");
  const submissionId = field(formData, "submission_id");
  const answerId = field(formData, "answer_id");
  const path = `${LIST_PATH}/${queryId}/submissions/${submissionId}`;

  const supabase = await createClient();
  const { error } = await supabase
    .from("al_answers")
    .update({ internal_note: field(formData, "internal_note") || null })
    .eq("id", answerId);
  failIfError(error, path, "Could not save the note");

  redirect(path);
}

// Transcription -------------------------------------------------------------------

export async function sendAnswerToTranscriptionAction(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("audience-listening");
  const queryId = field(formData, "query_id");
  const submissionId = field(formData, "submission_id");
  const answerId = field(formData, "answer_id");
  const path = `${LIST_PATH}/${queryId}/submissions/${submissionId}`;

  const result = await sendAnswerToTranscription(answerId);
  if (!result.ok) failWith(path, result.message);

  await logAuditEvent({
    actorId: profile.id,
    action: "al.answer.sent_to_transcription",
    targetType: "al_answer",
    targetId: answerId,
    metadata: { query_id: queryId, project_id: result.projectId },
  });

  redirect(path);
}

export async function sendQueuedAnswersAction(formData: FormData): Promise<void> {
  const { profile } = await assertToolAccess("audience-listening");
  const queryId = field(formData, "query_id");
  const path = queryPath(queryId, "submissions");

  const result = await sendQueuedAnswers(queryId);

  await logAuditEvent({
    actorId: profile.id,
    action: "al.query.queue_drained",
    targetType: "al_query",
    targetId: queryId,
    metadata: { sent: result.sent, failed: result.failed },
  });

  if (result.failed > 0) {
    failWith(
      path,
      `Sent ${result.sent}, but ${result.failed} failed. First failure: ${result.message ?? "unknown"}`,
    );
  }

  redirect(path);
}
