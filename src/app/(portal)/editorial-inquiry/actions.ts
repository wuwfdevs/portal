"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import {
  runEditorialTurn,
  type ChatTurnMessage,
  type EditorialTurnContext,
  type TurnMode,
} from "@/lib/editorial-inquiry/ai";
import {
  getInquiryDetail,
  getQuestionChat,
  type ChatMessageRecord,
} from "@/lib/editorial-inquiry/queries";
import {
  getActivePillarName,
  listCurrentCoreCriteria,
} from "@/lib/editorial-inquiry/editorial-planning";
import { buildPitchHandoffDraft, pitchHandoffUrl } from "@/lib/editorial-inquiry/pitch-handoff";
import {
  activeChildren,
  ancestryPath,
  inheritedContextNotes,
  type ContextNoteKind,
  type ContextNoteRecord,
  type DiagnosisKind,
  type EvidentiaryStatus,
  type QuestionRecord,
} from "@/lib/editorial-inquiry/tree";

const TOOL_KEY = "editorial-inquiry";
const LIST_PATH = "/editorial-inquiry";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

function err<T>(error: unknown): ActionResult<T> {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  console.error("Editorial Inquiry action failed:", error);
  return { ok: false, error: message };
}

/** Real HTML form, redirect-based like the rest of the portal — see design doc §3. */
export async function startNewInquiry(formData: FormData): Promise<void> {
  await assertToolAccess(TOOL_KEY);
  const pillarId = String(formData.get("pillar_id") ?? "").trim();
  if (!pillarId) failWith(LIST_PATH, "Choose a guiding question to start an inquiry.");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ei_create_inquiry", { p_pillar_id: pillarId });
  failIfError(error, LIST_PATH, "Could not start that inquiry");

  redirect(`${LIST_PATH}?inquiry=${data!.id}`);
}

function toQuestionRecord(data: {
  id: string;
  inquiry_id: string;
  parent_id: string | null;
  depth: number;
  text: string;
  status: string;
  diagnosis_kind: string | null;
  diagnosis_note: string | null;
  reframed_from_text: string | null;
  manual_dx: number | null;
  manual_dy: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}): QuestionRecord {
  return {
    id: data.id,
    inquiryId: data.inquiry_id,
    parentId: data.parent_id,
    depth: data.depth,
    text: data.text,
    status: data.status as QuestionRecord["status"],
    diagnosisKind: data.diagnosis_kind as DiagnosisKind | null,
    diagnosisNote: data.diagnosis_note,
    reframedFromText: data.reframed_from_text,
    manualDx: data.manual_dx,
    manualDy: data.manual_dy,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function toContextNoteRecord(data: {
  id: string;
  question_id: string;
  kind: string;
  body: string;
  evidentiary_status: string;
  source_title: string | null;
  source_url: string | null;
  created_by: string | null;
  created_at: string;
}): ContextNoteRecord {
  return {
    id: data.id,
    questionId: data.question_id,
    kind: data.kind as ContextNoteKind,
    body: data.body,
    evidentiaryStatus: data.evidentiary_status as EvidentiaryStatus,
    sourceTitle: data.source_title,
    sourceUrl: data.source_url,
    createdBy: data.created_by,
    createdAt: data.created_at,
  };
}

function toChatMessageRecord(row: {
  id: string;
  question_id: string;
  role: string;
  body: string;
  action_kind: string | null;
  action_payload: unknown;
  citations: unknown;
  applied_at: string | null;
  created_by: string | null;
  created_at: string;
}): ChatMessageRecord {
  return {
    id: row.id,
    questionId: row.question_id,
    role: row.role as "user" | "assistant",
    body: row.body,
    actionKind: row.action_kind as ChatMessageRecord["actionKind"],
    actionPayload: row.action_payload as Record<string, unknown> | null,
    citations: row.citations as { title: string; url: string }[] | null,
    appliedAt: row.applied_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

async function loadTurnContext(
  questionId: string,
  mode: TurnMode,
): Promise<{ inquiryId: string; question: QuestionRecord; context: EditorialTurnContext }> {
  const supabase = await createClient();
  const { data: questionRow, error } = await supabase
    .from("ei_questions")
    .select("*")
    .eq("id", questionId)
    .single();
  if (error || !questionRow) throw new Error("Could not find that question.");

  const detail = await getInquiryDetail(questionRow.inquiry_id);
  if (!detail) throw new Error("Could not find that question's inquiry.");
  const question = detail.questions.find((q) => q.id === questionId);
  if (!question) throw new Error("Could not find that question.");

  const ancestry = ancestryPath(detail.questions, questionId)
    .slice()
    .reverse()
    .map((id) => {
      const q = detail.questions.find((candidate) => candidate.id === id)!;
      return { depth: q.depth, text: q.text };
    });

  const relatedParentId = mode === "drilldown" ? question.id : question.parentId;
  const existingRelated = relatedParentId
    ? activeChildren(detail.questions, relatedParentId)
        .filter((q) => q.id !== question.id)
        .map((q) => q.text)
    : [];

  const inheritedContext = inheritedContextNotes(
    detail.questions,
    detail.contextNotes,
    questionId,
  ).map((r) => ({
    kind: r.note.kind,
    body: r.note.body,
    evidentiaryStatus: r.note.evidentiaryStatus,
    sourceTitle: r.note.sourceTitle,
    sourceUrl: r.note.sourceUrl,
  }));

  const criteria = await listCurrentCoreCriteria();

  return {
    inquiryId: questionRow.inquiry_id,
    question,
    context: {
      pillarName: detail.inquiry.pillarName,
      guidingQuestion: detail.inquiry.guidingQuestion,
      ancestry,
      inheritedContext,
      existingRelated,
      priorMessages: [],
      criteria,
    },
  };
}

async function insertQuestion(params: {
  inquiryId: string;
  parentId: string;
  depth: number;
  text: string;
  createdBy: string;
}): Promise<QuestionRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ei_questions")
    .insert({
      inquiry_id: params.inquiryId,
      parent_id: params.parentId,
      depth: params.depth,
      text: params.text,
      created_by: params.createdBy,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not add that question.");
  return toQuestionRecord(data);
}

/**
 * The manual fallback when the model is unavailable or a reporter just
 * wants to type their own angle — see design doc §13. Bypasses ai.ts
 * entirely; the reporter's own text becomes the new sibling/child, with no
 * diagnosis (nothing generated it) and no citations (nothing was searched).
 */
export async function addQuestionManually(
  questionId: string,
  kind: "sibling" | "child",
  text: string,
): Promise<ActionResult<QuestionRecord>> {
  try {
    const { profile } = await assertToolAccess(TOOL_KEY);
    const trimmed = text.trim();
    if (!trimmed) throw new Error("A question is required.");

    const supabase = await createClient();
    const { data: questionRow, error } = await supabase
      .from("ei_questions")
      .select("*")
      .eq("id", questionId)
      .single();
    if (error || !questionRow) throw new Error("Could not find that question.");

    if (kind === "sibling") {
      if (!questionRow.parent_id) throw new Error("The guiding question has no sibling to add.");
      const created = await insertQuestion({
        inquiryId: questionRow.inquiry_id,
        parentId: questionRow.parent_id,
        depth: questionRow.depth,
        text: trimmed,
        createdBy: profile.id,
      });
      return ok(created);
    }

    const created = await insertQuestion({
      inquiryId: questionRow.inquiry_id,
      parentId: questionRow.id,
      depth: questionRow.depth + 1,
      text: trimmed,
      createdBy: profile.id,
    });
    return ok(created);
  } catch (error) {
    return err(error);
  }
}

export async function rejectQuestion(questionId: string): Promise<ActionResult<null>> {
  try {
    await assertToolAccess(TOOL_KEY);
    const supabase = await createClient();
    const { error } = await supabase
      .from("ei_questions")
      .update({ status: "rejected" })
      .eq("id", questionId)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (error) {
    return err(error);
  }
}

export async function promoteQuestion(questionId: string): Promise<ActionResult<null>> {
  try {
    await assertToolAccess(TOOL_KEY);
    const supabase = await createClient();
    const { error } = await supabase
      .from("ei_questions")
      .update({ status: "promoted" })
      .eq("id", questionId)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (error) {
    return err(error);
  }
}

/** Persists a reporter's canvas drag as an offset from the computed layout position. */
export async function moveQuestion(
  questionId: string,
  manualDx: number,
  manualDy: number,
): Promise<ActionResult<null>> {
  try {
    await assertToolAccess(TOOL_KEY);
    const supabase = await createClient();
    const { error } = await supabase
      .from("ei_questions")
      .update({ manual_dx: manualDx, manual_dy: manualDy })
      .eq("id", questionId);
    if (error) throw new Error(error.message);
    return ok(null);
  } catch (error) {
    return err(error);
  }
}

export async function addContextNote(
  questionId: string,
  kind: ContextNoteKind,
  body: string,
  evidentiaryStatus: EvidentiaryStatus,
): Promise<ActionResult<ContextNoteRecord>> {
  try {
    const { profile } = await assertToolAccess(TOOL_KEY);
    const trimmed = body.trim();
    if (!trimmed) throw new Error("A note, link, or excerpt is required.");

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("ei_context_notes")
      .insert({
        question_id: questionId,
        kind,
        body: trimmed,
        evidentiary_status: evidentiaryStatus,
        created_by: profile.id,
      })
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not add that context.");
    return ok(toContextNoteRecord(data));
  } catch (error) {
    return err(error);
  }
}

/** Loaded lazily when the inspector's Discuss panel opens for a question. */
export async function loadDiscussThread(
  questionId: string,
): Promise<ActionResult<ChatMessageRecord[]>> {
  try {
    await assertToolAccess(TOOL_KEY);
    return ok(await getQuestionChat(questionId));
  } catch (error) {
    return err(error);
  }
}

export interface EditorialTurnOutcome {
  userMessage: ChatMessageRecord;
  assistantMessage: ChatMessageRecord;
  /** Set when the model branched/drilled down immediately (design doc §7/§9). */
  createdQuestion: QuestionRecord | null;
  /** Set when the model attached a context note immediately. */
  createdContextNote: ContextNoteRecord | null;
  /** Set when the model wrote a diagnosis onto the acted-on question. */
  updatedQuestion: QuestionRecord | null;
}

/**
 * The one place every editorial turn runs — Branch, Drill down, Evaluate,
 * and ordinary Discuss messages all call this with a different `mode` and
 * `userMessage` (a canned directive for the first three, the reporter's own
 * words for the last). See design doc §7.
 */
async function performEditorialTurn(
  questionId: string,
  mode: TurnMode,
  userMessage: string,
): Promise<ActionResult<EditorialTurnOutcome>> {
  try {
    const { profile } = await assertToolAccess(TOOL_KEY);
    const trimmed = userMessage.trim();
    if (!trimmed) throw new Error("A message is required.");

    const { inquiryId, question, context } = await loadTurnContext(questionId, mode);
    const supabase = await createClient();

    const priorRows =
      (
        await supabase
          .from("ei_chat_messages")
          .select("*")
          .eq("question_id", questionId)
          .order("created_at")
      ).data ?? [];
    const priorMessages: ChatTurnMessage[] = priorRows.map((row) => ({
      role: row.role as "user" | "assistant",
      body: row.body,
    }));

    const { data: userRow, error: userError } = await supabase
      .from("ei_chat_messages")
      .insert({ question_id: questionId, role: "user", body: trimmed, created_by: profile.id })
      .select("*")
      .single();
    if (userError || !userRow)
      throw new Error(userError?.message ?? "Could not send that message.");

    const result = await runEditorialTurn(
      mode,
      {
        text: question.text,
        diagnosisKind: question.diagnosisKind,
        diagnosisNote: question.diagnosisNote,
      },
      { ...context, priorMessages },
      trimmed,
    );

    let createdQuestion: QuestionRecord | null = null;
    let createdContextNote: ContextNoteRecord | null = null;
    let updatedQuestion: QuestionRecord | null = null;
    let actionPayload: Record<string, unknown> | null = null;
    let appliedAt: string | null = null;

    const action = result.action;
    if (action?.kind === "branch" && action.text) {
      if (!question.parentId) {
        // The root has no sibling to branch into — nothing to do.
      } else {
        createdQuestion = await insertQuestion({
          inquiryId,
          parentId: question.parentId,
          depth: question.depth,
          text: action.text,
          createdBy: profile.id,
        });
        actionPayload = { questionId: createdQuestion.id };
        appliedAt = new Date().toISOString();
      }
    } else if (action?.kind === "drilldown" && action.text) {
      createdQuestion = await insertQuestion({
        inquiryId,
        parentId: question.id,
        depth: question.depth + 1,
        text: action.text,
        createdBy: profile.id,
      });
      actionPayload = { questionId: createdQuestion.id };
      appliedAt = new Date().toISOString();
    } else if (action?.kind === "context" && action.text) {
      const { data: noteRow, error: noteError } = await supabase
        .from("ei_context_notes")
        .insert({
          question_id: questionId,
          kind: "note",
          body: action.text,
          evidentiary_status: action.evidentiaryStatus ?? "inference",
          source_title: action.sourceTitle,
          source_url: action.sourceUrl,
          created_by: profile.id,
        })
        .select("*")
        .single();
      if (noteError || !noteRow)
        throw new Error(noteError?.message ?? "Could not attach that context.");
      createdContextNote = toContextNoteRecord(noteRow);
      actionPayload = { contextNoteId: createdContextNote.id };
      appliedAt = new Date().toISOString();
    } else if (action?.kind === "reframe" && action.text) {
      actionPayload = { text: action.text };
      // appliedAt stays null — the reporter applies a reframe explicitly.
    } else if (action?.kind === "diagnosis" && action.diagnosisKind) {
      const { data: updatedRow, error: diagnosisError } = await supabase
        .from("ei_questions")
        .update({ diagnosis_kind: action.diagnosisKind, diagnosis_note: result.reply })
        .eq("id", questionId)
        .select("*")
        .single();
      if (diagnosisError || !updatedRow) {
        throw new Error(diagnosisError?.message ?? "Could not record that diagnosis.");
      }
      updatedQuestion = toQuestionRecord(updatedRow);
      actionPayload = { diagnosisKind: action.diagnosisKind };
      appliedAt = new Date().toISOString();
    } else if (action?.kind === "assessment" && action.text) {
      actionPayload = { text: action.text };
      appliedAt = new Date().toISOString();
    }

    const { data: assistantRow, error: assistantError } = await supabase
      .from("ei_chat_messages")
      .insert({
        question_id: questionId,
        role: "assistant",
        body: result.reply,
        action_kind: actionPayload ? action!.kind : null,
        action_payload: actionPayload,
        citations: result.citations.length
          ? (result.citations as unknown as Record<string, unknown>[])
          : null,
        applied_at: appliedAt,
      })
      .select("*")
      .single();
    if (assistantError || !assistantRow) {
      throw new Error(assistantError?.message ?? "Could not record the assistant's reply.");
    }

    return ok({
      userMessage: toChatMessageRecord(userRow),
      assistantMessage: toChatMessageRecord(assistantRow),
      createdQuestion,
      createdContextNote,
      updatedQuestion,
    });
  } catch (error) {
    return err(error);
  }
}

const BRANCH_DIRECTIVE =
  "Branch: look for a genuinely different angle here, grounded in what's already established. If the material doesn't support one, say so.";
const DRILLDOWN_DIRECTIVE =
  "Drill down: find a more specific, still-unresolved question beneath this one that moves it toward reportability. If there isn't one yet, say so.";
const EVALUATE_DIRECTIVE =
  "Evaluate this as a candidate story question: is it well-formed and reportable, and separately, would answering it likely make a strong WUWF story given our current editorial priorities?";

export async function branchQuestion(
  questionId: string,
): Promise<ActionResult<EditorialTurnOutcome>> {
  return performEditorialTurn(questionId, "branch", BRANCH_DIRECTIVE);
}

export async function drillDownQuestion(
  questionId: string,
): Promise<ActionResult<EditorialTurnOutcome>> {
  return performEditorialTurn(questionId, "drilldown", DRILLDOWN_DIRECTIVE);
}

export async function evaluateQuestion(
  questionId: string,
): Promise<ActionResult<EditorialTurnOutcome>> {
  return performEditorialTurn(questionId, "evaluate", EVALUATE_DIRECTIVE);
}

export async function sendDiscussMessage(
  questionId: string,
  message: string,
): Promise<ActionResult<EditorialTurnOutcome>> {
  return performEditorialTurn(questionId, "discuss", message);
}

/** Applies a discuss-proposed reframe: overwrites the question's text, records the prior text as a breadcrumb. */
export async function applyReframe(
  messageId: string,
  questionId: string,
  text: string,
): Promise<ActionResult<QuestionRecord>> {
  try {
    await assertToolAccess(TOOL_KEY);
    const supabase = await createClient();

    const { data: questionRow, error: questionReadError } = await supabase
      .from("ei_questions")
      .select("*")
      .eq("id", questionId)
      .single();
    if (questionReadError || !questionRow) throw new Error("Could not find that question.");

    const { data: updated, error: updateError } = await supabase
      .from("ei_questions")
      .update({ text, reframed_from_text: questionRow.text })
      .eq("id", questionId)
      .select("*")
      .single();
    if (updateError || !updated)
      throw new Error(updateError?.message ?? "Could not apply that reframe.");

    const { error: messageError } = await supabase
      .from("ei_chat_messages")
      .update({ applied_at: new Date().toISOString() })
      .eq("id", messageId);
    if (messageError) throw new Error(messageError.message);

    return ok(toQuestionRecord(updated));
  } catch (error) {
    return err(error);
  }
}

/**
 * Develop a promoted question into an Editorial Planning pitch (design doc
 * §8). Does not write ep_pitches directly — hands off to Editorial
 * Planning's own editorial.pitch.save capability, the same write path the
 * pitch form itself uses, so a developed pitch is an ordinary `open` pitch
 * afterward. Always reporter-initiated: called only when the reporter clicks
 * through, never automatically on promotion.
 */
export async function getPitchHandoffUrl(questionId: string): Promise<ActionResult<string>> {
  try {
    await assertToolAccess(TOOL_KEY);
    const supabase = await createClient();
    const { data: questionRow, error } = await supabase
      .from("ei_questions")
      .select("*")
      .eq("id", questionId)
      .single();
    if (error || !questionRow) throw new Error("Could not find that question.");
    if (questionRow.status !== "promoted") {
      throw new Error("Only a promoted question can be developed into a pitch.");
    }

    const detail = await getInquiryDetail(questionRow.inquiry_id);
    if (!detail) throw new Error("Could not find that question's inquiry.");

    const pillarName =
      (await getActivePillarName(detail.inquiry.pillarId)) ?? detail.inquiry.pillarName;
    const inheritedNotes = inheritedContextNotes(
      detail.questions,
      detail.contextNotes,
      questionId,
    ).map((r) => r.note);

    const draft = buildPitchHandoffDraft({
      storyQuestion: { text: questionRow.text },
      pillarName,
      inheritedNotes,
    });
    return ok(pitchHandoffUrl(draft));
  } catch (error) {
    return err(error);
  }
}
