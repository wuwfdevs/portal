// What travels with an answer into the Transcription Workspace. Pure and
// dependency-free — kept out of handoff.ts (which is server-only and talks to
// Storage) precisely so these two decisions are testable, because they are the
// ones with editorial and privacy consequences rather than mechanical ones.

import { transcriptionParticipantLabel } from "@/lib/audience-listening/participation";

/** Just the fields provenance needs, so a test doesn't have to build a whole row. */
export interface ProvenanceQuery {
  id: string;
  public_title: string;
}

export interface ProvenanceSubmission {
  id: string;
  submitted_at: string | null;
  participant_name: string | null;
  participant_city: string | null;
  participant_note: string | null;
  consent_contact: boolean;
  consent_identify: boolean;
  request_anonymous: boolean;
}

export interface ProvenanceAnswer {
  question_position: number;
  question_prompt: string;
}

/**
 * The project's background text.
 *
 * This is the Transcription Workspace's context field — its design doc §3G
 * calls it the whole context story, and its embeddings are built from it. So:
 * enough for a reporter finding this quote in eighteen months to know what it
 * is, and nothing that would be a privacy problem in a searchable, shared,
 * indexed field.
 *
 * Two rules that are not negotiable:
 *
 *   - The participant's name appears only when they gave permission to be
 *     identified AND did not ask to be considered anonymously
 *     (transcriptionParticipantLabel enforces both).
 *   - Email and phone never appear at all. They are not editorial context, the
 *     Transcription Workspace is a wider shared workspace than this tool, and a
 *     phone number that crosses into an indexed field does not come back.
 */
export function buildProvenance(params: {
  query: ProvenanceQuery;
  submission: ProvenanceSubmission;
  answer: ProvenanceAnswer;
  questionCount: number;
  siteUrl: string;
}): string {
  const { query, submission, answer } = params;
  const submittedAt = submission.submitted_at
    ? new Date(submission.submitted_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "date unknown";

  return [
    `Audience Listening — "${query.public_title}"`,
    ``,
    `Question ${answer.question_position} of ${params.questionCount}: ${answer.question_prompt}`,
    ``,
    `Submitted ${submittedAt} through the public listening page.`,
    `Participant: ${transcriptionParticipantLabel(submission)}`,
    submission.participant_city ? `Location: ${submission.participant_city}` : null,
    submission.participant_note ? `Participant's own note: ${submission.participant_note}` : null,
    ``,
    `Permission to contact: ${submission.consent_contact ? "yes" : "no"}`,
    `Permission to identify by name: ${submission.consent_identify ? "yes" : "no"}`,
    `Asked to be considered anonymously: ${submission.request_anonymous ? "yes" : "no"}`,
    ``,
    `Source: ${params.siteUrl}/audience-listening/${query.id}/submissions/${submission.id}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * The project title: readable in a list of interviews without opening it, and
 * subject to the same attribution rule as the background text — an
 * unattributable participant is "Anonymous participant", never their name.
 */
export function buildProjectTitle(params: {
  query: ProvenanceQuery;
  submission: Pick<
    ProvenanceSubmission,
    "participant_name" | "consent_identify" | "request_anonymous"
  >;
  answer: Pick<ProvenanceAnswer, "question_position">;
}): string {
  const name = params.submission.participant_name?.trim();
  const identifiable =
    Boolean(name) && params.submission.consent_identify && !params.submission.request_anonymous;
  const who = identifiable ? name : "Anonymous participant";
  return `${params.query.public_title} · Q${params.answer.question_position} · ${who}`;
}
