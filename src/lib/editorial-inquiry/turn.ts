import "server-only";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import {
  streamEditorialTurn,
  type ChatTurnMessage,
  type EditorialTurnContext,
  type EditorialTurnResult,
  type TurnMode,
} from "./ai";
import {
  getInquiryDetail,
  toChatMessageRecord,
  toContextNoteRecord,
  toQuestionRecord,
  type ChatMessageRecord,
} from "./queries";
import { listCurrentCoreCriteria } from "./editorial-planning";
import {
  activeChildren,
  ancestryPath,
  inheritedContextNotes,
  type ContextNoteRecord,
  type QuestionRecord,
} from "./tree";

// The editorial turn's server half: persistence around ai.ts's streaming
// reasoning call. Lives here rather than in the route's actions.ts because a
// Server Action can't stream — the reply reaches the browser token-by-token
// through src/app/api/editorial-inquiry/turn/route.ts's SSE stream (the same
// shape as the portal agent's /api/agent/chat), and that route is this
// module's one caller. Everything a turn writes (the user message, whatever
// the proposed action creates, the assistant message) is written only after
// the model's terminal result — a dropped connection mid-stream therefore
// persists nothing, so a retry can't duplicate half a turn.

const TOOL_KEY = "editorial-inquiry";

// See the comment where these apply: they bound how much of a question's
// discuss thread each turn re-sends to the model. ~12 messages × ~1k tokens
// keeps a worst-case replay near 12k tokens instead of unbounded.
const MAX_REPLAYED_MESSAGES = 12;
const MAX_REPLAYED_MESSAGE_CHARS = 4000;

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

/** What the SSE route relays: reply tokens, then exactly one terminal event. */
export type EditorialTurnStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; outcome: EditorialTurnOutcome }
  | { type: "error"; message: string };

export async function insertQuestion(params: {
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

/**
 * The one place every editorial turn runs — Branch, Drill down, Evaluate,
 * and ordinary Discuss messages all stream through here with a different
 * `mode` and `userMessage` (a canned directive from directives.ts for the
 * first three, the reporter's own words for the last). See design doc §7.
 */
export async function* streamEditorialTurnEvents(
  questionId: string,
  mode: TurnMode,
  userMessage: string,
): AsyncGenerator<Exclude<EditorialTurnStreamEvent, { type: "error" }>> {
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
  // Replay only the thread's recent tail, with long bodies clipped — the
  // whole thread was re-sent on every turn, growing without bound, which is
  // how one long discussion walked straight into the org's OpenAI
  // tokens-per-minute cap (observed live: one turn requesting ~20k tokens
  // against a 100k TPM limit). The durable conclusions of older turns
  // already reach the model another way: diagnoses live on the question row
  // and attached findings live on as context notes, both carried in the
  // prompt regardless of thread length.
  const priorMessages: ChatTurnMessage[] = priorRows.slice(-MAX_REPLAYED_MESSAGES).map((row) => ({
    role: row.role as "user" | "assistant",
    body:
      row.body.length > MAX_REPLAYED_MESSAGE_CHARS
        ? `${row.body.slice(0, MAX_REPLAYED_MESSAGE_CHARS)} […]`
        : row.body,
  }));

  const turn = streamEditorialTurn(
    mode,
    {
      text: question.text,
      depth: question.depth,
      diagnosisKind: question.diagnosisKind,
      diagnosisNote: question.diagnosisNote,
    },
    { ...context, priorMessages },
    trimmed,
  );

  let result: EditorialTurnResult | null = null;
  for await (const event of turn) {
    if (event.type === "delta") {
      yield { type: "delta", text: event.text };
    } else {
      result = event.result;
    }
  }
  if (!result) throw new Error("The assistant failed to respond.");

  // Only now — after the model finished — does anything persist, in the same
  // order milestone 1 wrote: the user message, then the action's write, then
  // the assistant message.
  const { data: userRow, error: userError } = await supabase
    .from("ei_chat_messages")
    .insert({ question_id: questionId, role: "user", body: trimmed, created_by: profile.id })
    .select("*")
    .single();
  if (userError || !userRow) throw new Error(userError?.message ?? "Could not send that message.");

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
    // Prefer the tool call's own `text` argument for the stored note — the
    // model sometimes puts its whole explanation there and writes little or
    // no separate prose, and dropping it left diagnoses with a bare kind
    // label and an empty chat bubble.
    const { data: updatedRow, error: diagnosisError } = await supabase
      .from("ei_questions")
      .update({
        diagnosis_kind: action.diagnosisKind,
        diagnosis_note: action.text ?? (result.reply || null),
      })
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

  // A diagnosis or assessment whose whole substance arrived in the tool
  // call's `text` argument still needs a readable message body — an empty
  // assistant bubble was a real reported bug.
  const assistantBody =
    result.reply ||
    ((action?.kind === "diagnosis" || action?.kind === "assessment") && action.text
      ? action.text
      : "");

  const { data: assistantRow, error: assistantError } = await supabase
    .from("ei_chat_messages")
    .insert({
      question_id: questionId,
      role: "assistant",
      body: assistantBody,
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

  yield {
    type: "done",
    outcome: {
      userMessage: toChatMessageRecord(userRow),
      assistantMessage: toChatMessageRecord(assistantRow),
      createdQuestion,
      createdContextNote,
      updatedQuestion,
    },
  };
}
