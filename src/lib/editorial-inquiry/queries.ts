import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Database } from "@/lib/database.types";
import type { ContextNoteRecord, QuestionRecord } from "./tree";

/**
 * Data access for Editorial Inquiry. Every read goes through the RLS-scoped
 * server client, so private.has_editorial_inquiry_access is what actually
 * decides what comes back — these functions add shape, not authorization.
 * Reads are unwrapped rather than defaulted to `[]`, per CLAUDE.md: a query
 * that errors and falls back to empty renders exactly like a healthy empty
 * inquiry.
 */

export type EiInquiryRow = Database["public"]["Tables"]["ei_inquiries"]["Row"];
export type EiQuestionRow = Database["public"]["Tables"]["ei_questions"]["Row"];
export type EiContextNoteRow = Database["public"]["Tables"]["ei_context_notes"]["Row"];
export type EiChatMessageRow = Database["public"]["Tables"]["ei_chat_messages"]["Row"];

export interface InquirySummary {
  id: string;
  seedQuestion: string;
  createdAt: string;
  updatedAt: string;
}

function toQuestionRecord(row: EiQuestionRow): QuestionRecord {
  return {
    id: row.id,
    inquiryId: row.inquiry_id,
    parentId: row.parent_id,
    depth: row.depth,
    text: row.text,
    status: row.status as QuestionRecord["status"],
    hasAssumption: row.has_assumption,
    assumptionText: row.assumption_text,
    reframedFromText: row.reframed_from_text,
    manualDx: row.manual_dx,
    manualDy: row.manual_dy,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toContextNoteRecord(row: EiContextNoteRow): ContextNoteRecord {
  return {
    id: row.id,
    questionId: row.question_id,
    kind: row.kind as ContextNoteRecord["kind"],
    body: row.body,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** Every saved inquiry, most recently updated first — the switcher's list. */
export async function listInquiries(): Promise<InquirySummary[]> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase.from("ei_inquiries").select("*").order("updated_at", { ascending: false }),
      "the saved inquiries",
    ) ?? [];
  return rows.map((row) => ({
    id: row.id,
    seedQuestion: row.seed_question,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export interface InquiryDetail {
  inquiry: InquirySummary;
  questions: QuestionRecord[];
  contextNotes: ContextNoteRecord[];
}

/** One inquiry's full tree plus every context note in it — the canvas's initial data. */
export async function getInquiryDetail(inquiryId: string): Promise<InquiryDetail | null> {
  const supabase = await createClient();
  const inquiryRow = unwrapRead(
    await supabase.from("ei_inquiries").select("*").eq("id", inquiryId).maybeSingle(),
    "this inquiry",
  );
  if (!inquiryRow) return null;

  const questionRows =
    unwrapRead(
      await supabase
        .from("ei_questions")
        .select("*")
        .eq("inquiry_id", inquiryId)
        .order("created_at"),
      "this inquiry's questions",
    ) ?? [];
  const questionIds = questionRows.map((q) => q.id);

  const contextNoteRows = questionIds.length
    ? (unwrapRead(
        await supabase
          .from("ei_context_notes")
          .select("*")
          .in("question_id", questionIds)
          .order("created_at"),
        "this inquiry's context notes",
      ) ?? [])
    : [];

  return {
    inquiry: {
      id: inquiryRow.id,
      seedQuestion: inquiryRow.seed_question,
      createdAt: inquiryRow.created_at,
      updatedAt: inquiryRow.updated_at,
    },
    questions: questionRows.map(toQuestionRecord),
    contextNotes: contextNoteRows.map(toContextNoteRecord),
  };
}

export interface ChatMessageRecord {
  id: string;
  questionId: string;
  role: "user" | "assistant";
  body: string;
  actionKind: "reframe" | "sibling" | "context" | null;
  actionPayload: Record<string, unknown> | null;
  appliedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** One question's discuss thread, oldest first — loaded lazily when the inspector opens Discuss. */
export async function getQuestionChat(questionId: string): Promise<ChatMessageRecord[]> {
  const supabase = await createClient();
  const rows =
    unwrapRead(
      await supabase
        .from("ei_chat_messages")
        .select("*")
        .eq("question_id", questionId)
        .order("created_at"),
      "this question's discussion",
    ) ?? [];
  return rows.map((row) => ({
    id: row.id,
    questionId: row.question_id,
    role: row.role as "user" | "assistant",
    body: row.body,
    actionKind: row.action_kind as ChatMessageRecord["actionKind"],
    actionPayload: row.action_payload as Record<string, unknown> | null,
    appliedAt: row.applied_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}
