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
  saveTextAnswer: "/api/site/listening/save-text-answer",
  completeAnswer: "/api/site/listening/complete-answer",
  saveDetails: "/api/site/listening/save-details",
  finalize: "/api/site/listening/finalize",
  forgetSubject: "/api/site/listening/forget-subject",
  hub: "/api/site/listening/hub",
  inboxSend: "/api/site/listening/inbox-send",
  hostRequest: "/api/site/listening/host-request",
} as const;

/**
 * Fields every request may carry. `clientHash` is the site's own hash of the visitor's network address, so the
 * Portal can rate-limit without ever receiving or storing an address. Optional; omitting it leaves only the
 * subject's own limit.
 */
export interface ListeningRequestBase {
  clientHash?: string;
}

/** The longest `clientHash` the Portal accepts. */
export const MAX_CLIENT_HASH_LENGTH = 128;

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
  /** Who is asking ("Leigh Ostrander"), where the question is from ("from the WUWF News desk"), and what it belongs to ("After Isaias"). */
  askedBy: string | null;
  fromLabel: string | null;
  contextLabel: string | null;
  /** Whether the site may offer "Write" beside "Record". */
  allowTextAnswers: boolean;
  state: ListeningQueryState;
  opensAt: string | null;
  closesAt: string | null;
  consentText: string;
  askContactPermission: boolean;
  askAttributionPermission: boolean;
  allowAnonymousRequest: boolean;
  fields: { name: ListeningFieldMode; email: ListeningFieldMode; phone: ListeningFieldMode; city: ListeningFieldMode; note: ListeningFieldMode };
  questions: ListeningQuestion[];
  /**
   * What came of this question, when it is listed on the hub and has an outcome (the newest one), with how many people answered. Null
   * otherwise: an open question's count never leaves the Portal.
   */
  outcome: (ListeningOutcome & { responseCount: number }) | null;
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
export interface ListeningQueryRequest extends ListeningRequestBase {
  publicId: string;
}
export type ListeningQueryResponse = ListeningResult<{ query: ListeningQuery }>;

/** Opens this subject's in-progress submission, or resumes it. */
export interface ListeningStartRequest extends ListeningRequestBase {
  subject: ListeningSubject;
  publicId: string;
}
export type ListeningStartResponse = ListeningResult<{ submissionId: string; resumed: boolean }>;

export interface ListeningProgressRequest extends ListeningRequestBase {
  subject: ListeningSubject;
  submissionId: string;
}
export type ListeningAnswerStatus = "pending" | "uploaded" | "failed";
export interface ListeningProgressAnswer {
  answerId: string;
  questionId: string | null;
  kind: "audio" | "text";
  status: ListeningAnswerStatus;
  durationMs: number | null;
  /** A written answer's words, so a reopened page can show them. Null for a recording. */
  text: string | null;
}
export type ListeningProgressResponse = ListeningResult<{ status: "in_progress" | "submitted"; answers: ListeningProgressAnswer[] }>;

/**
 * Creates (or resets, on a redo) the answer row and snapshots the question's wording, position and required flag
 * itself: the site never supplies them. The reply carries a signed upload address for the audio.
 */
export interface ListeningReserveAnswerRequest extends ListeningRequestBase {
  subject: ListeningSubject;
  submissionId: string;
  questionId: string;
  /** A bare type, codec parameters stripped (`audio/webm`, not `audio/webm;codecs=opus`). */
  contentType: string;
}
export interface ListeningUpload {
  /** The audio goes straight from the browser to this address, never through the site. A raw body, not a form. */
  url: string;
  method: "PUT";
  /** Sent with the upload exactly as given (the content type is pinned to the one reserved). */
  headers: Record<string, string>;
  /** ISO time after which the address stops working. Storage fixes this at two hours; the row must still be open. */
  expiresAt: string;
}
export type ListeningReserveAnswerResponse = ListeningResult<{ answerId: string; upload: ListeningUpload; maxDurationSeconds: number }>;

/** A written answer, where the query allows it (`allowTextAnswers`). Replaces a recording or an earlier written answer. */
export interface ListeningSaveTextAnswerRequest extends ListeningRequestBase {
  subject: ListeningSubject;
  submissionId: string;
  questionId: string;
  /** Plain text, 1 to 4,000 characters. */
  text: string;
}
export type ListeningSaveTextAnswerResponse = ListeningResult<{ answerId: string }>;

/** Longest written answer. */
export const MAX_TEXT_ANSWER_LENGTH = 4000;

/** Tells the Portal the browser's upload finished, so it can check the object and mark the answer uploaded. */
export interface ListeningCompleteAnswerRequest extends ListeningRequestBase {
  subject: ListeningSubject;
  answerId: string;
  sizeBytes: number;
  durationMs: number | null;
}
export type ListeningCompleteAnswerResponse = ListeningResult<Record<never, never>>;

/** Only the participant and consent columns of the subject's own open submission. */
export interface ListeningSaveDetailsRequest extends ListeningRequestBase {
  subject: ListeningSubject;
  submissionId: string;
  details: { name: string | null; email: string | null; phone: string | null; city: string | null; note: string | null };
  consent: { contact: boolean; identify: boolean; requestAnonymous: boolean };
}
export type ListeningSaveDetailsResponse = ListeningResult<Record<never, never>>;

/** Validates everything and flips the submission to submitted. `consentAgreed` is the terms checkbox. */
export interface ListeningFinalizeRequest extends ListeningRequestBase {
  subject: ListeningSubject;
  submissionId: string;
  consentAgreed: boolean;
}
export type ListeningFinalizeResponse = ListeningResult<{ answers: number }>;

/**
 * Erases what a subject has not yet sent and detaches the rest (used when a site account is deleted). Submitted
 * answers stay as editorial records without the subject.
 */
export interface ListeningForgetSubjectRequest extends ListeningRequestBase {
  subject: ListeningSubject;
}
export type ListeningForgetSubjectResponse = ListeningResult<Record<never, never>>;

/** What came of a question: the kind of piece, its title, and where it lives. Staff paste the address; the Portal knows no CMS. */
export type ListeningOutcomeKind = "story" | "episode" | "report";

export interface ListeningOutcome {
  kind: ListeningOutcomeKind;
  title: string;
  /** An https address. */
  url: string;
  /** A calendar date, `YYYY-MM-DD`. */
  publishedAt: string;
  summary: string | null;
}

/** A question that is open now and listed for the hub. It carries no count: an open question's tally never leaves the Portal. */
export interface ListeningHubOpen {
  publicId: string;
  title: string;
  intro: string;
  askedBy: string | null;
  fromLabel: string | null;
  contextLabel: string | null;
  closesAt: string | null;
  /** Whether the question also takes a written answer, for the card's "by voice or in writing". */
  allowTextAnswers: boolean;
  questionCount: number;
}

/** A listed question with at least one outcome. The count is allowed here, and only here. */
export interface ListeningHubAnswered {
  publicId: string;
  title: string;
  askedBy: string | null;
  fromLabel: string | null;
  contextLabel: string | null;
  responseCount: number;
  /** Newest first; never empty. */
  outcomes: ListeningOutcome[];
}

/**
 * The website's listening page: what is being asked now, and what came of what was asked. Campaigns and their
 * reports join this message as additive fields when they exist (phase D of the suite design); a reader ignores
 * fields it does not know.
 */
export interface ListeningHub {
  open: ListeningHubOpen[];
  answered: ListeningHubAnswered[];
}

/** The hub needs no subject: it is a public read, like `query`. */
export type ListeningHubRequest = ListeningRequestBase;
export type ListeningHubResponse = ListeningResult<{ hub: ListeningHub }>;

// -------------------------------------------------------------------------------------------------------------
// The standing inboxes (suite design §2, phase C). Neither belongs to a campaign, and neither needs an account or a box
// ticked: a person writes, and a person at the station reads every one. Nothing here promises a reply or a date.

/** "Ask WUWF": a question for the newsroom, or an idea for a story. */
export const LISTENING_INBOX_KINDS = ["question", "story_idea"] as const;
export type ListeningInboxKind = (typeof LISTENING_INBOX_KINDS)[number];

/** The longest message Ask WUWF takes, and the longest email address. */
export const MAX_INBOX_BODY_LENGTH = 2000;
export const MAX_EMAIL_LENGTH = 320;

/**
 * Sends one Ask WUWF message. The email is optional ("so we can tell you what came of it"). The Portal stores the message and the
 * email and nothing that identifies the sender: the subject is only what the rate limit counts, and is not kept on the row.
 */
export interface ListeningInboxSendRequest extends ListeningRequestBase {
  subject: ListeningSubject;
  kind: ListeningInboxKind;
  /** 1 to 2,000 characters of plain text. */
  body: string;
  email: string | null;
}
export type ListeningInboxSendResponse = ListeningResult<Record<never, never>>;

/** Board 5c's form: "bring a listening session to your table". */
export const LISTENING_HOST_KINDS = ["invite", "public"] as const;
export type ListeningHostKind = (typeof LISTENING_HOST_KINDS)[number];
/** Seats the host expects to offer, as the form's three choices. */
export const LISTENING_HOST_SEATS = [12, 30, 60] as const;
export type ListeningHostSeats = (typeof LISTENING_HOST_SEATS)[number];
/** How many people the host expects to turn up. */
export const LISTENING_HOST_EXPECTED = ["6-8", "9-12", "12+"] as const;
export type ListeningHostExpected = (typeof LISTENING_HOST_EXPECTED)[number];

export interface ListeningHostRequestRequest extends ListeningRequestBase {
  subject: ListeningSubject;
  name: string;
  email: string;
  kind: ListeningHostKind;
  organization: string | null;
  seats: ListeningHostSeats;
  address: string;
  expected: ListeningHostExpected;
  /** When the host has in mind, in their own words ("a Saturday in March"). Free text: the station schedules it. */
  whenText: string;
  /** Who they would invite. Optional. */
  inviteesText: string | null;
  /** Whether they would like a WUWF journalist to join. */
  journalistRequested: boolean;
}
export type ListeningHostRequestResponse = ListeningResult<Record<never, never>>;

/**
 * Where a table's single-use link opens on the site (phase D and E of the suite design). The Portal issues the link and prints it
 * on the table's card as a QR code; the site serves this path and redeems the token with the Portal. It is a path on the site's own
 * origin, so the Portal builds the address and the site owns the page. The token is a path segment, never a query value, so it
 * is not carried to another origin in a Referer header or an analytics query string.
 */
export const LISTENING_TABLE_LINK_PATH = "/listens/table";

/** The longest table link token the site accepts: a 256-bit value in base64url is 43 characters. */
export const LISTENING_TABLE_TOKEN_LENGTH = 43;

/** The address a table's link opens, from the site's origin (no trailing slash needed) and the token. */
export function listeningTableLinkUrl(siteOrigin: string, token: string): string {
  return `${siteOrigin.replace(/\/+$/, "")}${LISTENING_TABLE_LINK_PATH}/${encodeURIComponent(token)}`;
}
