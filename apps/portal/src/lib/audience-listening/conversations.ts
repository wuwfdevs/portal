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
