// Contract 3 — audience listening (site → Portal). The Portal owns the data (queries, submissions, answers,
// consent, audio, review); the site owns every screen a listener sees and renders them over these messages.
// The site never stores a submission, a consent record or an audio file.
//
// Every request is signed with `signRequest` (signing.ts) using the LISTENING channel's own secret, never
// another channel's. Every request carries the SUBJECT: the site's own opaque identifier for the visitor
// or account taking part. The Portal sees nothing else about the participant, and decides what that
// subject may do (one in-progress submission per subject per query, at most three in total).
//
// The messages mirror the Portal's seven participant functions one for one (apps/portal/docs/audience-listening-design.md §6),
// so the rules (open window, required questions, consent, size and duration caps, the question snapshot) stay
// where they are enforced. Nothing here reimplements them; `@wuwf/listening-core` renders them.
//
// Types and light shape checks only. Each side validates what it receives.

/** Paths the Portal exposes for this channel. All are POST with a JSON body, signed over that exact body. */
export const LISTENING_PATHS = {
  query: "/api/site/listening/query",
  start: "/api/site/listening/start",
  progress: "/api/site/listening/progress",
  reserveAnswer: "/api/site/listening/reserve-answer",
  completeAnswer: "/api/site/listening/complete-answer",
  saveDetails: "/api/site/listening/save-details",
  finalize: "/api/site/listening/finalize",
} as const;

export type ListeningPath = (typeof LISTENING_PATHS)[keyof typeof LISTENING_PATHS];

/** Smallest secret length, as for every channel. */
export const LISTENING_SECRET_MIN_LENGTH = 32;

/** The longest subject id the Portal will store. */
export const MAX_SUBJECT_ID_LENGTH = 128;

/**
 * Who is taking part, as the SITE knows them. `visitor` is a browser the site has set its own cookie in;
 * `account` is a signed-in audience profile. The id is opaque to the Portal and is never an email address,
 * a name, or a donor/membership id (the site's identities stay separate and are never linked on an email match).
 */
export interface ListeningSubject {
  kind: "visitor" | "account";
  id: string;
}

export function isListeningSubject(value: unknown): value is ListeningSubject {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v["kind"] === "visitor" || v["kind"] === "account") &&
    typeof v["id"] === "string" &&
    v["id"].length > 0 &&
    v["id"].length <= MAX_SUBJECT_ID_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(v["id"])
  );
}

/** Mirrors the Portal's AlFieldMode: how a query treats one participant field. */
export type ListeningFieldMode = "hidden" | "optional" | "required";

/** Whether a query accepts submissions right now (the Portal's AlPublicState). */
export type ListeningQueryState = "open" | "not_yet_open" | "closed";

export interface ListeningQuestion {
  id: string;
  position: number;
  prompt: string;
  guidance: string | null;
  required: boolean;
  maxDurationSeconds: number;
}

/** Exactly what the public may see of a query. Never internal titles, notes or context, and nothing about submissions. */
export interface ListeningQuery {
  publicId: string;
  title: string;
  intro: string;
  state: ListeningQueryState;
  opensAt: string | null;
  closesAt: string | null;
  consentText: string;
  askContactPermission: boolean;
  askAttributionPermission: boolean;
  allowAnonymousRequest: boolean;
  fields: { name: ListeningFieldMode; email: ListeningFieldMode; phone: ListeningFieldMode; city: ListeningFieldMode; note: ListeningFieldMode };
  questions: ListeningQuestion[];
}

/** Every refusal the Portal can give. The site turns each into a sentence; the codes are the contract. */
export const LISTENING_ERROR_CODES = [
  /** A draft and a wrong public id answer identically, so a draft's link cannot be probed. */
  "not_available",
  "not_accepting",
  "not_open",
  "submission_limit",
  "unsupported_type",
  "unknown_question",
  "invalid_size",
  "too_long",
  "consent_required",
  "no_answers",
  "required_answer_missing",
  "required_field_missing",
  /** The submission or answer is not this subject's, or does not exist: the two are not told apart. */
  "not_found",
  "rate_limited",
  "invalid_request",
  /** The Portal's own failure. The site says "something went wrong on our side" and logs the code, never the body. */
  "unavailable",
] as const;

export type ListeningErrorCode = (typeof LISTENING_ERROR_CODES)[number];

export function isListeningErrorCode(value: unknown): value is ListeningErrorCode {
  return typeof value === "string" && (LISTENING_ERROR_CODES as readonly string[]).includes(value);
}

export interface ListeningFailure {
  ok: false;
  error: ListeningErrorCode;
}

export type ListeningResult<T> = ({ ok: true } & T) | ListeningFailure;

/** Reading a query needs no subject: it is the one public read. `null` query = not available. */
export interface ListeningQueryRequest {
  publicId: string;
}
export type ListeningQueryResponse = ListeningResult<{ query: ListeningQuery }>;

/** Opens this subject's in-progress submission, or resumes it. */
export interface ListeningStartRequest {
  subject: ListeningSubject;
  publicId: string;
}
export type ListeningStartResponse = ListeningResult<{ submissionId: string; resumed: boolean }>;

export interface ListeningProgressRequest {
  subject: ListeningSubject;
  submissionId: string;
}
export type ListeningAnswerStatus = "pending" | "uploaded" | "failed";
export interface ListeningProgressAnswer {
  answerId: string;
  questionId: string | null;
  status: ListeningAnswerStatus;
  durationMs: number | null;
}
export type ListeningProgressResponse = ListeningResult<{ status: "in_progress" | "submitted"; answers: ListeningProgressAnswer[] }>;

/**
 * Creates (or resets, on a redo) the answer row and snapshots the question's wording, position and required flag
 * itself: the site never supplies them. The reply carries a signed upload address for the audio.
 */
export interface ListeningReserveAnswerRequest {
  subject: ListeningSubject;
  submissionId: string;
  questionId: string;
  /** A bare type, codec parameters stripped (`audio/webm`, not `audio/webm;codecs=opus`). */
  contentType: string;
}
export interface ListeningUpload {
  /** The audio goes straight from the browser to this address, never through the site. */
  url: string;
  method: "PUT";
  /** Sent with the upload exactly as given. */
  headers: Record<string, string>;
  /** ISO time after which the address stops working. */
  expiresAt: string;
}
export type ListeningReserveAnswerResponse = ListeningResult<{ answerId: string; upload: ListeningUpload; maxDurationSeconds: number }>;

/** Tells the Portal the browser's upload finished, so it can check the object and mark the answer uploaded. */
export interface ListeningCompleteAnswerRequest {
  subject: ListeningSubject;
  answerId: string;
  sizeBytes: number;
  durationMs: number | null;
}
export type ListeningCompleteAnswerResponse = ListeningResult<Record<never, never>>;

/** Only the participant and consent columns of the subject's own open submission. */
export interface ListeningSaveDetailsRequest {
  subject: ListeningSubject;
  submissionId: string;
  details: { name: string | null; email: string | null; phone: string | null; city: string | null; note: string | null };
  consent: { contact: boolean; identify: boolean; requestAnonymous: boolean };
}
export type ListeningSaveDetailsResponse = ListeningResult<Record<never, never>>;

/** Validates everything and flips the submission to submitted. `consentAgreed` is the terms checkbox. */
export interface ListeningFinalizeRequest {
  subject: ListeningSubject;
  submissionId: string;
  consentAgreed: boolean;
}
export type ListeningFinalizeResponse = ListeningResult<{ answers: number }>;
