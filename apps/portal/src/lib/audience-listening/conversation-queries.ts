import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import type { Database } from "@/lib/database.types";

/**
 * Staff-side reads for a table's conversation: its speakers, highlights and contact cards, and the transcript lines from Sourcework.
 * Through the RLS-scoped client. A contact card's columns are listed by name because staff cannot read its `subject` (the website's
 * opaque id for the person), so `select *` would be refused.
 */

export type AlSpeaker = Database["public"]["Tables"]["al_speakers"]["Row"];
export type AlHighlight = Database["public"]["Tables"]["al_highlights"]["Row"];
export type AlContactCard = Omit<Database["public"]["Tables"]["al_contact_cards"]["Row"], never>;
export type AlSegment = Database["public"]["Tables"]["al_conversation_segments"]["Row"];

export async function getConversationForTable(tableId: string) {
  const supabase = await createClient();
  const result = await supabase.from("al_conversations").select("*").eq("table_id", tableId).maybeSingle();
  return unwrapRead(result, "the conversation");
}

export async function listSegments(conversationId: string): Promise<AlSegment[]> {
  const supabase = await createClient();
  const result = await supabase.from("al_conversation_segments").select("*").eq("conversation_id", conversationId).order("seq", { ascending: true });
  return unwrapRead(result, "the conversation's segments") ?? [];
}

export async function listSpeakers(conversationId: string): Promise<AlSpeaker[]> {
  const supabase = await createClient();
  const result = await supabase.from("al_speakers").select("*").eq("conversation_id", conversationId).order("first_heard_ms", { ascending: true });
  return unwrapRead(result, "the conversation's speakers") ?? [];
}

export async function listHighlights(conversationId: string): Promise<AlHighlight[]> {
  const supabase = await createClient();
  const result = await supabase.from("al_highlights").select("*").eq("conversation_id", conversationId).order("start_ms", { ascending: true });
  return unwrapRead(result, "the conversation's highlights") ?? [];
}

const CARD_COLUMNS =
  "id, conversation_id, first_name, contact, may_contact, may_name, keep_anonymous, speaker_id, contacted_at, contacted_by, name_approved_at, created_at, updated_at";

export async function listContactCards(conversationId: string): Promise<AlContactCard[]> {
  const supabase = await createClient();
  const result = await supabase.from("al_contact_cards").select(CARD_COLUMNS).eq("conversation_id", conversationId).order("created_at", { ascending: true });
  return (unwrapRead(result, "the conversation's contact cards") ?? []) as AlContactCard[];
}

export interface StaffTranscript {
  state: "ready" | "processing" | "failed" | "none";
  lines: { startMs: number; endMs: number; text: string; voice: string | null }[];
}

/**
 * The transcript lines, read through staff's own access to Sourcework's records. A member without Sourcework reads none and sees a
 * line saying so rather than an empty transcript: `unreadable` is true when the representation could not be read at all.
 */
export async function getStaffTranscript(sourceId: string | null): Promise<StaffTranscript & { unreadable: boolean }> {
  if (!sourceId) return { state: "none", lines: [], unreadable: false };
  const supabase = await createClient();
  const rep = await supabase.from("sw_representations").select("id, status").eq("source_id", sourceId).eq("kind", "transcript").maybeSingle();
  if (rep.error) {
    console.error("Read failed (the conversation's transcript):", rep.error);
    return { state: "none", lines: [], unreadable: true };
  }
  if (!rep.data) return { state: "none", lines: [], unreadable: true };
  if (rep.data.status !== "ready") return { state: rep.data.status === "failed" ? "failed" : "processing", lines: [], unreadable: false };

  const [segments, speakers] = await Promise.all([
    supabase.from("tw_segments").select("speaker_id, position, start_ms, end_ms, text").eq("representation_id", rep.data.id).order("position", { ascending: true }),
    supabase.from("tw_speakers").select("id, diarization_label, display_name").eq("representation_id", rep.data.id),
  ]);
  const rows = unwrapRead(segments, "the transcript lines") ?? [];
  const voices = new Map((unwrapRead(speakers, "the transcript's speakers") ?? []).map((s) => [s.id, s.diarization_label]));
  return {
    state: "ready",
    unreadable: false,
    lines: rows.map((r) => ({ startMs: r.start_ms, endMs: r.end_ms, text: r.text, voice: r.speaker_id ? (voices.get(r.speaker_id) ?? null) : null })),
  };
}

export interface PurgePreview {
  submissions: number;
  conversations: number;
  cards: number;
  /** Old and unsent but kept, because a reviewer has acted on a contact card in them. */
  held: number;
  /** Facilitator emails and after-page links more than 30 days past their event. */
  emails: number;
}

/** What is due for the 30-day purge. Throws on a failure so the screen says so rather than showing zeros. */
export async function getPurgePreview(): Promise<PurgePreview> {
  const supabase = await createClient();
  const result = await supabase.rpc("al_purge_preview");
  const value = unwrapRead(result, "what is due to purge");
  return { submissions: Number(value?.submissions ?? 0), conversations: Number(value?.conversations ?? 0), cards: Number(value?.cards ?? 0), held: Number(value?.held ?? 0), emails: Number(value?.emails ?? 0) };
}
