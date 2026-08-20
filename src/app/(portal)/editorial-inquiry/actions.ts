"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { failIfError, failWith } from "@/lib/editorial/action-result";
import {
  getInquiryDetail,
  getQuestionChat,
  toContextNoteRecord,
  toQuestionRecord,
  type ChatMessageRecord,
} from "@/lib/editorial-inquiry/queries";
import { getActivePillarName } from "@/lib/editorial-inquiry/editorial-planning";
import { buildPitchHandoffDraft, pitchHandoffUrl } from "@/lib/editorial-inquiry/pitch-handoff";
import { insertQuestion } from "@/lib/editorial-inquiry/turn";
import {
  inheritedContextNotes,
  type ContextNoteKind,
  type ContextNoteRecord,
  type EvidentiaryStatus,
  type QuestionRecord,
} from "@/lib/editorial-inquiry/tree";

// The non-streaming actions only. Branch, Drill down, Evaluate, and Discuss
// turns — everything that runs the model — moved to
// src/app/api/editorial-inquiry/turn/route.ts (SSE) with their shared
// persistence in lib/editorial-inquiry/turn.ts; a Server Action can't stream
// a reply token-by-token.

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

/** Loaded lazily the first time the inspector shows a question's discussion. */
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
 * The reporter's confirming click on a model promote nomination (a turn's
 * kind "promote" tool call) — same shape as applyReframe: the status write
 * plus marking the nominating message applied. Promotion itself is still
 * always this explicit reporter action, never the model's own write.
 */
export async function applyPromotion(
  messageId: string,
  questionId: string,
): Promise<ActionResult<null>> {
  try {
    await assertToolAccess(TOOL_KEY);
    const supabase = await createClient();
    const { error } = await supabase
      .from("ei_questions")
      .update({ status: "promoted" })
      .eq("id", questionId)
      .eq("status", "active");
    if (error) throw new Error(error.message);

    const { error: messageError } = await supabase
      .from("ei_chat_messages")
      .update({ applied_at: new Date().toISOString() })
      .eq("id", messageId);
    if (messageError) throw new Error(messageError.message);

    return ok(null);
  } catch (error) {
    return err(error);
  }
}

/**
 * Develop a promoted question into an Editorial Planning pitch (design doc
 * §8). Builds a prefilled URL to Editorial Planning's own pitch form rather
 * than writing ep_pitches directly — always reporter-initiated: called only
 * when the reporter clicks through, never automatically on promotion.
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
