// Pure helpers for the conversation screens: how a status reads, a time in a recording, and the one warning a contact card can carry.

import type { AlConversationStatus } from "@/lib/database.types";

export const CONVERSATION_STATUS_LABEL: Record<AlConversationStatus, string> = {
  recording: "Recording",
  uploading: "Uploading",
  complete: "Recording complete",
  transcribing: "Transcribing",
  ready: "Transcript ready",
  named: "Voices named",
  sent: "Sent by the facilitator",
};

export interface TimedSegment {
  seq: number;
  /** When the phone started recording it (ISO), when it said. */
  started_at: string | null;
  duration_ms: number | null;
}

export interface RecordingGap {
  /** The segment after the gap. */
  beforeSeq: number;
  /** Seconds the phone recorded nothing between the end of one segment and the start of the next. */
  seconds: number;
}

/** A pause shorter than this is the join between two segments, not a gap worth showing. */
export const GAP_MIN_SECONDS = 20;

/**
 * Where a table's phone recorded nothing between two segments: a deliberate pause, a phone that locked, a microphone that dropped.
 * Staff cannot tell which from the times alone, so this only says how long and where. Segments without a start time are skipped.
 */
export function findGaps(segments: TimedSegment[]): RecordingGap[] {
  const timed = segments
    .filter((s) => s.started_at !== null && s.duration_ms !== null)
    .map((s) => ({ seq: s.seq, start: Date.parse(s.started_at as string), end: Date.parse(s.started_at as string) + (s.duration_ms as number) }))
    .filter((s) => Number.isFinite(s.start))
    .sort((a, b) => a.seq - b.seq);
  const gaps: RecordingGap[] = [];
  for (let i = 1; i < timed.length; i += 1) {
    const seconds = Math.round((timed[i]!.start - timed[i - 1]!.end) / 1000);
    if (seconds >= GAP_MIN_SECONDS) gaps.push({ beforeSeq: timed[i]!.seq, seconds });
  }
  return gaps;
}

/** "2 minutes 10 seconds", "45 seconds". */
export function describeGap(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} seconds`;
  return rest === 0 ? `${minutes} ${minutes === 1 ? "minute" : "minutes"}` : `${minutes} ${minutes === 1 ? "minute" : "minutes"} ${rest} seconds`;
}

/** "1:05:09" or "4:09": a position in a recording, from milliseconds. */
export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/**
 * The board warns, and the database accepts: a person who says "you may contact me" but left no way to reach them is recorded as
 * they chose, and the reviewer is told, because some people want only to be named.
 */
export function cardNeedsContactWarning(card: { may_contact: boolean; contact: string | null }): boolean {
  return card.may_contact && !(card.contact ?? "").trim();
}

/**
 * Whether a conversation's recording can be sent to Sourcework: it is whole (the table ended and every segment uploaded) and not yet
 * sent there. A facilitator who sent the conversation first has not stopped staff from transcribing it.
 */
export function canSendToSourcework(conversation: { status: AlConversationStatus; sourcework_source_id: string | null }): boolean {
  return conversation.sourcework_source_id === null && (conversation.status === "complete" || conversation.status === "sent");
}
