// Pure status-derivation for the internal screens: how a query, a submission,
// an answer, and a transcription handoff are labelled, and what action each
// state offers. Kept separate from the data access in queries.ts so the
// labelling rules — the part a reporter actually reads — are testable under
// Vitest, per CLAUDE.md's testing expectations and the same pattern as
// lib/remote-interview/track-status.ts.

import type { BadgeVariant } from "@/components/ui/badge";
import type {
  AlAnswerStatus,
  AlQueryStatus,
  AlReviewState,
  AlTranscriptionState,
} from "@/lib/database.types";

export const QUERY_STATUS_BADGE: Record<AlQueryStatus, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "muted" },
  open: { label: "Open", variant: "accent" },
  closed: { label: "Closed", variant: "neutral" },
  archived: { label: "Archived", variant: "muted" },
};

export const REVIEW_STATE_BADGE: Record<AlReviewState, { label: string; variant: BadgeVariant }> = {
  new: { label: "Unreviewed", variant: "warning" },
  reviewed: { label: "Reviewed", variant: "success" },
  flagged: { label: "Flagged", variant: "warning" },
  rejected: { label: "Rejected", variant: "danger" },
};

export const TRANSCRIPTION_BADGE: Record<
  AlTranscriptionState,
  { label: string; variant: BadgeVariant }
> = {
  none: { label: "Not sent", variant: "muted" },
  queued: { label: "Queued", variant: "neutral" },
  sent: { label: "In Transcription", variant: "accent" },
  failed: { label: "Handoff failed", variant: "danger" },
};

export const ANSWER_STATUS_BADGE: Record<AlAnswerStatus, { label: string; variant: BadgeVariant }> =
  {
    pending: { label: "Upload incomplete", variant: "warning" },
    uploaded: { label: "Audio received", variant: "success" },
    failed: { label: "Upload failed", variant: "danger" },
  };

/**
 * What the answer row offers to do about transcription next.
 *
 * "send" and "retry" are the same operation with different words on the
 * button; keeping them distinct here is what lets the screen say "Retry" after
 * a failure instead of silently offering "Send" again as though nothing had
 * happened.
 */
export type TranscriptionAction = "send" | "retry" | "open" | "unavailable";

export function transcriptionActionFor(answer: {
  status: AlAnswerStatus;
  transcription_state: AlTranscriptionState;
  transcription_project_id: string | null;
}): TranscriptionAction {
  if (answer.status !== "uploaded") return "unavailable";
  if (answer.transcription_state === "sent" && answer.transcription_project_id) return "open";
  if (answer.transcription_state === "failed") return "retry";
  return "send";
}

/**
 * The one-line transcription state for a whole submission, for the list. A
 * submission is only "complete" when every answer that could go to
 * transcription has; anything else is reported as the count, because "3 of 4"
 * is the thing a reporter needs and a green tick would be a lie.
 */
export function summarizeSubmissionTranscription(
  answers: { status: AlAnswerStatus; transcription_state: AlTranscriptionState }[],
): { label: string; variant: BadgeVariant } {
  const eligible = answers.filter((answer) => answer.status === "uploaded");
  if (eligible.length === 0) return { label: "—", variant: "muted" };

  const failed = eligible.filter((answer) => answer.transcription_state === "failed").length;
  const sent = eligible.filter((answer) => answer.transcription_state === "sent").length;
  const queued = eligible.filter((answer) => answer.transcription_state === "queued").length;

  if (failed > 0) return { label: `${failed} failed`, variant: "danger" };
  if (sent === eligible.length) return { label: "All sent", variant: "accent" };
  if (queued > 0) return { label: `${queued} queued`, variant: "neutral" };
  if (sent > 0) return { label: `${sent} of ${eligible.length} sent`, variant: "neutral" };
  return { label: "Not sent", variant: "muted" };
}

/** Review actions offered for a submission or an answer, given its current state. */
export function reviewActionsFor(state: AlReviewState): AlReviewState[] {
  return (["new", "reviewed", "flagged", "rejected"] as AlReviewState[]).filter(
    (candidate) => candidate !== state,
  );
}

export const REVIEW_ACTION_LABEL: Record<AlReviewState, string> = {
  new: "Mark unreviewed",
  reviewed: "Mark reviewed",
  flagged: "Flag",
  rejected: "Reject",
};
