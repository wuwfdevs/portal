import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PublicQueryPayload } from "@/lib/database.types";

/**
 * The participant-facing half of this tool, and the only code path a member of
 * the public reaches.
 *
 * Every function here is a thin wrapper over one of the seven security-definer
 * functions in 20260730170000_audience_listening.sql. That indirection is the
 * whole security model, not an implementation detail: `al_*` table RLS is
 * staff-only, so there is no participant-visible row for this code to read or
 * write directly. See the migration's header comment for why RLS alone cannot
 * express the split (the same al_queries row holds a public title and internal
 * notes, and RLS is row-level).
 *
 * Consequences worth keeping in mind when editing:
 *
 *   - Nothing here trusts a caller-supplied identity. Each function re-derives
 *     ownership from auth.uid() inside the database.
 *   - Every validation that matters (open window, required questions, required
 *     fields, consent, duration, size, content type) happens in SQL, in the
 *     same transaction as the write. What the client checks is a courtesy.
 *   - The functions return a jsonb payload with an `error` code rather than
 *     raising, so a refused write is a value to render, not an exception.
 */

/** Distinct failure codes the public flow turns into sentences. */
export type ParticipantErrorCode =
  | "unauthenticated"
  | "not_accepting"
  | "not_open"
  | "submission_limit"
  | "unsupported_type"
  | "unknown_question"
  | "invalid_size"
  | "too_long"
  | "consent_required"
  | "no_answers"
  | "required_answer_missing"
  | "required_field_missing"
  | "unavailable";

const ERROR_MESSAGES: Record<ParticipantErrorCode, string> = {
  unauthenticated: "Your session expired. Reload the page to start again.",
  not_accepting: "This question set isn't accepting responses right now.",
  not_open: "This response has already been submitted, or is no longer open.",
  submission_limit: "You've already responded to this a few times. Thank you!",
  unsupported_type: "Your browser recorded a format we can't accept. Try a different browser.",
  unknown_question: "That question is no longer part of this set. Reload the page.",
  invalid_size: "That recording is too large to accept.",
  too_long: "That recording is longer than this question allows.",
  consent_required: "Please accept the terms before submitting.",
  no_answers: "Record at least one answer before submitting.",
  required_answer_missing: "A required question still needs an answer.",
  required_field_missing: "Please fill in the information marked required.",
  unavailable: "Something went wrong on our side. Please try again.",
};

export function participantErrorMessage(code: string | undefined): string {
  return (
    ERROR_MESSAGES[(code ?? "unavailable") as ParticipantErrorCode] ?? ERROR_MESSAGES.unavailable
  );
}

type Payload = Record<string, unknown> | null;

function errorCodeOf(payload: Payload): string | undefined {
  const code = payload?.["error"];
  return typeof code === "string" ? code : undefined;
}

/**
 * The public view of a query: the one function `anon` may call, and the only
 * read this tool exposes without a session. Returns null for a draft exactly as
 * it does for a public id that doesn't exist — a draft link must not be
 * distinguishable from a wrong one.
 */
export async function getPublicQuery(publicId: string): Promise<PublicQueryPayload | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("al_public_query", { p_public_id: publicId });

  if (error) {
    console.error("al_public_query failed:", error);
    throw new Error(`Could not load this page: ${error.message}`);
  }
  return data;
}

/**
 * Establishes the participant's anonymous identity if they don't already have
 * one, then opens (or resumes) their submission.
 *
 * The anonymous sign-in is the same mechanism Remote Interview's guests use
 * (see lib/remote-interview/guest.ts) and requires anonymous sign-ins to be
 * enabled in the Supabase project's dashboard. It happens here, at "Begin",
 * rather than on page load: an article embed is read by far more people than
 * respond to it, and creating an auth user for every reader would be both
 * wasteful and a surprise.
 */
export async function startSubmission(
  publicId: string,
): Promise<{ submissionId: string } | { error: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) {
      // Most likely cause: anonymous sign-in isn't enabled for this Supabase
      // project — see README.md's one-time setup list.
      console.error("Anonymous sign-in failed:", signInError);
      return { error: participantErrorMessage("unauthenticated") };
    }
  }

  const { data, error } = await supabase.rpc("al_start_submission", { p_public_id: publicId });
  if (error) {
    console.error("al_start_submission failed:", error);
    return { error: participantErrorMessage("unavailable") };
  }

  const payload = data as Payload;
  const code = errorCodeOf(payload);
  if (code) return { error: participantErrorMessage(code) };

  const submissionId = payload?.["submission_id"];
  if (typeof submissionId !== "string") return { error: participantErrorMessage("unavailable") };
  return { submissionId };
}

export interface SavedAnswer {
  answerId: string;
  questionId: string | null;
  status: "pending" | "uploaded" | "failed";
  durationMs: number | null;
}

/** What this submission already holds, so reopening the page restores progress. */
export async function getProgress(
  submissionId: string,
): Promise<{ status: "in_progress" | "submitted"; answers: SavedAnswer[] } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("al_participant_progress", {
    p_submission_id: submissionId,
  });
  if (error) {
    console.error("al_participant_progress failed:", error);
    return null;
  }
  if (!data) return null;

  return {
    status: data.status,
    answers: data.answers.map((answer) => ({
      answerId: answer.answer_id,
      questionId: answer.question_id,
      status: answer.status,
      durationMs: answer.duration_ms,
    })),
  };
}

/**
 * Creates (or resets) the answer row and hands back where the browser should
 * put the bytes. The row exists before the object does — the same order the
 * Transcription Workspace's upload uses, and what makes it impossible to write
 * a storage object no row knows about.
 */
export async function reserveAnswer(params: {
  submissionId: string;
  questionId: string;
  contentType: string;
}): Promise<{ answerId: string; storagePath: string } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("al_reserve_answer", {
    p_submission_id: params.submissionId,
    p_question_id: params.questionId,
    p_content_type: params.contentType,
  });
  if (error) {
    console.error("al_reserve_answer failed:", error);
    return { error: participantErrorMessage("unavailable") };
  }

  const payload = data as Payload;
  const code = errorCodeOf(payload);
  if (code) return { error: participantErrorMessage(code) };

  const answerId = payload?.["answer_id"];
  const storagePath = payload?.["storage_path"];
  if (typeof answerId !== "string" || typeof storagePath !== "string") {
    return { error: participantErrorMessage("unavailable") };
  }
  return { answerId, storagePath };
}

/** Confirms a successful direct upload. Size and duration are re-checked in SQL. */
export async function completeAnswer(params: {
  answerId: string;
  sizeBytes: number;
  durationMs: number | null;
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("al_complete_answer", {
    p_answer_id: params.answerId,
    p_size_bytes: params.sizeBytes,
    p_duration_ms: params.durationMs,
  });
  if (error) {
    console.error("al_complete_answer failed:", error);
    return { error: participantErrorMessage("unavailable") };
  }

  const code = errorCodeOf(data as Payload);
  if (code) return { error: participantErrorMessage(code) };
  return { ok: true };
}

export async function saveParticipantDetails(params: {
  submissionId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  note: string | null;
  consentContact: boolean;
  consentIdentify: boolean;
  requestAnonymous: boolean;
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("al_save_participant_details", {
    p_submission_id: params.submissionId,
    p_name: params.name,
    p_email: params.email,
    p_phone: params.phone,
    p_city: params.city,
    p_note: params.note,
    p_consent_contact: params.consentContact,
    p_consent_identify: params.consentIdentify,
    p_request_anonymous: params.requestAnonymous,
  });
  if (error) {
    console.error("al_save_participant_details failed:", error);
    return { error: participantErrorMessage("unavailable") };
  }

  const code = errorCodeOf(data as Payload);
  if (code) return { error: participantErrorMessage(code) };
  return { ok: true };
}

/**
 * The one irreversible step. A second call can never succeed: every
 * participant function requires status = 'in_progress', and this is what ends
 * that — which is how duplicate final submissions are prevented in the
 * database rather than by disabling a button.
 */
export async function finalizeSubmission(params: {
  submissionId: string;
  consentAgreed: boolean;
}): Promise<{ ok: true; answers: number } | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("al_finalize_submission", {
    p_submission_id: params.submissionId,
    p_consent_agreed: params.consentAgreed,
  });
  if (error) {
    console.error("al_finalize_submission failed:", error);
    return { error: participantErrorMessage("unavailable") };
  }

  const payload = data as Payload;
  const code = errorCodeOf(payload);
  if (code) return { error: participantErrorMessage(code) };

  const answers = payload?.["answers"];
  return { ok: true, answers: typeof answers === "number" ? answers : 0 };
}
