import { createPublicAudienceClient } from "@/lib/audience-listening/public-client";
import { participantErrorMessage } from "@/lib/audience-listening/participant-errors";

/**
 * The client-side half of the participant flow — everything except
 * `getPublicQuery()`, which stays in `participant.ts` (server-only) because it
 * is an unauthenticated, anon-callable read rendered once by the Server
 * Component and needs no session at all.
 *
 * Every function here is the client-transport twin of the one by the same
 * name that used to live behind a Server Action in this route's `actions.ts`
 * (now removed): same names, same signatures, same `{ error }`-shaped
 * failures, so `participate.tsx` needed no changes beyond its import line.
 * What changed is *how* the call reaches Postgres — through
 * `createPublicAudienceClient()` (bearer-token auth, held in localStorage)
 * instead of a cookie-based session a Server Action had to recover from the
 * incoming request. See public-client.ts for why that swap was necessary: a
 * cookie set inside this route's cross-origin iframe embed does not reliably
 * survive the round trip back to the server.
 *
 * Every RPC error path re-derives its message from the returned `{ error }`
 * payload the same way participant.ts always did — the seven al_* functions'
 * business-logic refusals (e.g. `not_open`, `consent_required`) are identical
 * regardless of which client called them; only the transport moved.
 */

type Payload = Record<string, unknown> | null;

function errorCodeOf(payload: Payload): string | undefined {
  const code = payload?.["error"];
  return typeof code === "string" ? code : undefined;
}

/**
 * Establishes the participant's anonymous identity if this client doesn't
 * already hold one, then opens (or resumes) their submission.
 *
 * Held in localStorage rather than a cookie (see public-client.ts), so a
 * reload of the same tab finds the existing session via `getUser()` below and
 * skips re-signing-in — the same "resume" behaviour the old cookie-based flow
 * intended, just no longer dependent on the cookie surviving the trip back.
 */
export async function beginParticipation(
  publicId: string,
): Promise<{ submissionId: string } | { error: string }> {
  const supabase = createPublicAudienceClient();

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
export async function loadProgress(
  submissionId: string,
): Promise<{ status: "in_progress" | "submitted"; answers: SavedAnswer[] } | null> {
  const supabase = createPublicAudienceClient();
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
 * Transcription Workspace's upload uses, and what makes it impossible to
 * write a storage object no row knows about.
 */
export async function reserveAnswerSlot(params: {
  submissionId: string;
  questionId: string;
  contentType: string;
}): Promise<{ answerId: string; storagePath: string } | { error: string }> {
  const supabase = createPublicAudienceClient();
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
export async function confirmAnswerUpload(params: {
  answerId: string;
  sizeBytes: number;
  durationMs: number | null;
}): Promise<{ ok: true } | { error: string }> {
  const supabase = createPublicAudienceClient();
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
}): Promise<{ ok: true } | { error: string }> {
  const supabase = createPublicAudienceClient();
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
export async function submitResponse(params: {
  submissionId: string;
  consentAgreed: boolean;
}): Promise<{ ok: true; answers: number } | { error: string }> {
  const supabase = createPublicAudienceClient();
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
