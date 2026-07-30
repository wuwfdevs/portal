"use server";

import {
  completeAnswer,
  finalizeSubmission,
  getProgress,
  reserveAnswer,
  saveParticipantDetails,
  startSubmission,
} from "@/lib/audience-listening/participant";

/**
 * The public flow's server actions. Every one is a thin pass-through to
 * lib/audience-listening/participant.ts, which is itself a thin wrapper over
 * the security-definer functions that ARE this tool's public API — see that
 * file, and the migration's header comment, for why the participant never
 * touches an al_* table directly.
 *
 * These actions carry no authorization of their own on purpose. There is
 * nothing here for them to check: identity is the caller's anonymous Supabase
 * session, and every rule (is the query open, is this your submission, is that
 * recording within the limit) is enforced in SQL, in the same transaction as
 * the write. An action that re-checked those in JavaScript would be a second,
 * weaker copy of the real boundary.
 *
 * The audio itself never passes through here: uploads go directly from the
 * browser to Supabase Storage under the participant's own session, per
 * CLAUDE.md's direct-to-storage rule.
 */

export async function beginParticipation(
  publicId: string,
): Promise<{ submissionId: string } | { error: string }> {
  return startSubmission(publicId);
}

export async function loadProgress(submissionId: string) {
  return getProgress(submissionId);
}

export async function reserveAnswerSlot(params: {
  submissionId: string;
  questionId: string;
  contentType: string;
}) {
  return reserveAnswer(params);
}

export async function confirmAnswerUpload(params: {
  answerId: string;
  sizeBytes: number;
  durationMs: number | null;
}) {
  return completeAnswer(params);
}

export async function saveDetails(params: {
  submissionId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  note: string | null;
  consentContact: boolean;
  consentIdentify: boolean;
  requestAnonymous: boolean;
}) {
  return saveParticipantDetails(params);
}

export async function submitResponse(params: { submissionId: string; consentAgreed: boolean }) {
  return finalizeSubmission(params);
}
