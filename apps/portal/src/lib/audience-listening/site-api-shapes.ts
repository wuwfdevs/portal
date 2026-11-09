// The pure half of the site's signed listening API: validate a request body, say which database function it
// calls and with what, turn the function's answer into the contract's response, and name the HTTP status and rate
// limit for each message. No Supabase, no Next, so it runs under Vitest. The server half is site-api.ts.
//
// The contract is packages/portal-contracts/src/listening.ts. The rules (open window, caps, consent, the question
// snapshot) live in the al_site_* SQL functions; nothing here reimplements them, it only refuses malformed input
// early and with a stable code.

import {
  LISTENING_ERROR_CODES,
  MAX_CLIENT_HASH_LENGTH,
  MAX_TEXT_ANSWER_LENGTH,
  isListeningErrorCode,
  isListeningSubject,
  type ListeningErrorCode,
  type ListeningHub,
  type ListeningOutcomeKind,
  type ListeningQuery,
  type ListeningSubject,
} from "@wuwf/portal-contracts";
import { MAX_ANSWER_BYTES, isAllowedAnswerType, normalizeContentType } from "@/lib/audience-listening/media";

export const LISTENING_ACTIONS = [
  "query",
  "start",
  "progress",
  "reserve-answer",
  "save-text-answer",
  "complete-answer",
  "save-details",
  "finalize",
  "forget-subject",
  "hub",
] as const;
export type ListeningAction = (typeof LISTENING_ACTIONS)[number];

export function isListeningAction(value: string): value is ListeningAction {
  return (LISTENING_ACTIONS as readonly string[]).includes(value);
}

const PUBLIC_ID = /^[a-z0-9]{16}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_HASH = /^[A-Za-z0-9_-]+$/;
const MAX_DURATION_MS = 60 * 60 * 1000;

/** The database's name for a subject: `site:<kind>:<id>`. The namespace keeps a site id from colliding with anything else. */
export function subjectKey(subject: ListeningSubject): string {
  return `site:${subject.kind}:${subject.id}`;
}

export interface ParticipantDetails {
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  note: string | null;
}

/** A request after validation. `rpc` is the function and its arguments; `subjectKey` is null for the one public read. */
export interface ParsedListeningRequest {
  action: ListeningAction;
  subjectKey: string | null;
  clientHash: string | null;
  rpc: { fn: string; args: Record<string, unknown> };
  /** Needed after the call (the content type pinned on the signed upload). */
  contentType?: string;
}

export type ParseResult = { ok: true; request: ParsedListeningRequest } | { ok: false; error: "invalid_request" };

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function str(value: unknown, max: number): string | null | undefined {
  // undefined = invalid, null = absent/empty, string = ok
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > max) return undefined;
  return value;
}
function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
}
function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

const BAD: ParseResult = { ok: false, error: "invalid_request" };

function parseDetails(value: unknown): ParticipantDetails | null {
  if (!isObj(value)) return null;
  const limits: Record<keyof ParticipantDetails, number> = { name: 200, email: 320, phone: 40, city: 200, note: 4000 };
  const out = {} as ParticipantDetails;
  for (const key of Object.keys(limits) as (keyof ParticipantDetails)[]) {
    const v = str(value[key], limits[key]);
    if (v === undefined) return null;
    out[key] = v;
  }
  return out;
}

/** Validates a decoded JSON body for one message. A malformed body is `invalid_request`, never a thrown error. */
export function parseListeningRequest(action: ListeningAction, body: unknown): ParseResult {
  if (!isObj(body)) return BAD;

  let clientHash: string | null = null;
  if (body["clientHash"] !== undefined) {
    const h = body["clientHash"];
    if (typeof h !== "string" || h.length === 0 || h.length > MAX_CLIENT_HASH_LENGTH || !CLIENT_HASH.test(h)) return BAD;
    clientHash = h;
  }

  // The hub is the other public read: no subject, no arguments.
  if (action === "hub") {
    return { ok: true, request: { action, subjectKey: null, clientHash, rpc: { fn: "al_site_hub", args: {} } } };
  }

  // The query read carries no subject.
  if (action === "query") {
    const publicId = body["publicId"];
    if (typeof publicId !== "string" || !PUBLIC_ID.test(publicId)) return BAD;
    return { ok: true, request: { action, subjectKey: null, clientHash, rpc: { fn: "al_site_query", args: { p_public_id: publicId } } } };
  }

  if (!isListeningSubject(body["subject"])) return BAD;
  const key = subjectKey(body["subject"]);
  const done = (rpc: ParsedListeningRequest["rpc"], extra: Partial<ParsedListeningRequest> = {}): ParseResult => ({
    ok: true,
    request: { action, subjectKey: key, clientHash, rpc, ...extra },
  });

  switch (action) {
    case "start": {
      const publicId = body["publicId"];
      if (typeof publicId !== "string" || !PUBLIC_ID.test(publicId)) return BAD;
      return done({ fn: "al_site_start_submission", args: { p_subject: key, p_public_id: publicId } });
    }
    case "progress": {
      const submissionId = uuid(body["submissionId"]);
      if (!submissionId) return BAD;
      return done({ fn: "al_site_progress", args: { p_subject: key, p_submission_id: submissionId } });
    }
    case "reserve-answer": {
      const submissionId = uuid(body["submissionId"]);
      const questionId = uuid(body["questionId"]);
      const raw = body["contentType"];
      if (!submissionId || !questionId || typeof raw !== "string" || raw.length > 100) return BAD;
      // Codec parameters are stripped ("audio/webm;codecs=opus" -> "audio/webm"): storage matches exact types.
      const contentType = normalizeContentType(raw);
      if (!isAllowedAnswerType(contentType)) return BAD;
      return done(
        { fn: "al_site_reserve_answer", args: { p_subject: key, p_submission_id: submissionId, p_question_id: questionId, p_content_type: contentType } },
        { contentType },
      );
    }
    case "save-text-answer": {
      const submissionId = uuid(body["submissionId"]);
      const questionId = uuid(body["questionId"]);
      const text = body["text"];
      if (!submissionId || !questionId || typeof text !== "string") return BAD;
      const trimmed = text.trim();
      if (trimmed.length === 0 || trimmed.length > MAX_TEXT_ANSWER_LENGTH) return BAD;
      return done({ fn: "al_site_save_text_answer", args: { p_subject: key, p_submission_id: submissionId, p_question_id: questionId, p_text: trimmed } });
    }
    case "complete-answer": {
      const answerId = uuid(body["answerId"]);
      const size = body["sizeBytes"];
      const duration = body["durationMs"];
      if (!answerId || typeof size !== "number" || !Number.isInteger(size) || size < 1 || size > MAX_ANSWER_BYTES) return BAD;
      if (duration !== null && duration !== undefined) {
        if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 0 || duration > MAX_DURATION_MS) return BAD;
      }
      return done({
        fn: "al_site_complete_answer",
        args: { p_subject: key, p_answer_id: answerId, p_size_bytes: size, p_duration_ms: duration ?? null },
      });
    }
    case "save-details": {
      const submissionId = uuid(body["submissionId"]);
      const details = parseDetails(body["details"]);
      const consent = body["consent"];
      if (!submissionId || !details || !isObj(consent)) return BAD;
      const contact = bool(consent["contact"]);
      const identify = bool(consent["identify"]);
      const anonymous = bool(consent["requestAnonymous"]);
      if (contact === null || identify === null || anonymous === null) return BAD;
      return done({
        fn: "al_site_save_details",
        args: {
          p_subject: key,
          p_submission_id: submissionId,
          p_name: details.name,
          p_email: details.email,
          p_phone: details.phone,
          p_city: details.city,
          p_note: details.note,
          p_consent_contact: contact,
          p_consent_identify: identify,
          p_request_anonymous: anonymous,
        },
      });
    }
    case "finalize": {
      const submissionId = uuid(body["submissionId"]);
      const agreed = bool(body["consentAgreed"]);
      if (!submissionId || agreed === null) return BAD;
      return done({ fn: "al_site_finalize", args: { p_subject: key, p_submission_id: submissionId, p_consent_agreed: agreed } });
    }
    case "forget-subject":
      return done({ fn: "al_site_forget_subject", args: { p_subject: key } });
  }
}

// -------------------------------------------------------------------------------------------------------------
// What the database function answered, in the contract's words.

/** A function returns `{ error: "<code>" }` for a refusal. Anything not in the contract is the Portal's own failure. */
export function errorCodeFrom(payload: unknown): ListeningErrorCode | null {
  if (!isObj(payload) || payload["error"] === undefined) return null;
  const code = payload["error"];
  if (code === "unauthenticated") return "invalid_request";
  return isListeningErrorCode(code) ? code : "unavailable";
}

export type ShapedResponse = { ok: true; body: Record<string, unknown> } | { ok: false; error: ListeningErrorCode };

function fail(error: ListeningErrorCode): ShapedResponse {
  return { ok: false, error };
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** The newest outcome al_site_query attaches, or null if it is absent or not usable (no https link, unknown kind). */
function shapeQueryOutcome(value: unknown): ListeningQuery["outcome"] {
  if (!isObj(value)) return null;
  const kind = OUTCOME_KINDS.find((k) => k === value["kind"]);
  const title = asString(value["title"]);
  const url = httpsUrl(value["url"]);
  const publishedAt = asString(value["published_at"]);
  if (!kind || !title || !url || !publishedAt) return null;
  return { kind, title, url, publishedAt, summary: asString(value["summary"]), responseCount: asNumber(value["response_count"]) ?? 0 };
}

/** Maps al_site_query's payload onto the contract's ListeningQuery. `null` means a draft or an unknown id. */
export function shapeQuery(payload: unknown): ListeningQuery | null {
  if (!isObj(payload)) return null;
  const fields = isObj(payload["fields"]) ? payload["fields"] : {};
  const mode = (v: unknown) => (v === "required" || v === "optional" ? v : "hidden");
  const questions = Array.isArray(payload["questions"]) ? payload["questions"] : [];
  const state = payload["state"];
  return {
    publicId: asString(payload["public_id"]) ?? "",
    title: asString(payload["public_title"]) ?? "",
    intro: asString(payload["public_intro"]) ?? "",
    askedBy: asString(payload["asked_by"]),
    fromLabel: asString(payload["from_label"]),
    contextLabel: asString(payload["context_label"]),
    allowTextAnswers: payload["allow_text_answers"] === true,
    state: state === "open" || state === "not_yet_open" ? state : "closed",
    opensAt: asString(payload["opens_at"]),
    closesAt: asString(payload["closes_at"]),
    consentText: asString(payload["consent_text"]) ?? "",
    askContactPermission: payload["ask_contact_permission"] === true,
    askAttributionPermission: payload["ask_attribution_permission"] === true,
    allowAnonymousRequest: payload["allow_anonymous_request"] === true,
    fields: {
      name: mode(fields["name"]),
      email: mode(fields["email"]),
      phone: mode(fields["phone"]),
      city: mode(fields["city"]),
      note: mode(fields["note"]),
    },
    outcome: shapeQueryOutcome(payload["outcome"]),
    questions: questions.filter(isObj).map((q) => ({
      id: asString(q["id"]) ?? "",
      position: asNumber(q["position"]) ?? 0,
      prompt: asString(q["prompt"]) ?? "",
      guidance: asString(q["guidance"]),
      required: q["required"] === true,
      maxDurationSeconds: asNumber(q["max_duration_seconds"]) ?? 120,
    })),
  };
}

const OUTCOME_KINDS: readonly ListeningOutcomeKind[] = ["story", "episode", "report"];

/** Only an https address leaves the Portal as a link; the database checks this too, and a stored row is not trusted blindly. */
function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Maps al_site_hub's payload onto the contract's ListeningHub. A malformed row is dropped, never passed on half-formed. */
export function shapeHub(payload: unknown): ListeningHub {
  const rows = (value: unknown) => (Array.isArray(value) ? value.filter(isObj) : []);
  const source = isObj(payload) ? payload : {};

  const open = rows(source["open"]).flatMap((q) => {
    const publicId = asString(q["public_id"]);
    const title = asString(q["public_title"]);
    if (!publicId || !title) return [];
    return [
      {
        publicId,
        title,
        intro: asString(q["public_intro"]) ?? "",
        askedBy: asString(q["asked_by"]),
        fromLabel: asString(q["from_label"]),
        contextLabel: asString(q["context_label"]),
        closesAt: asString(q["closes_at"]),
        allowTextAnswers: q["allow_text_answers"] === true,
        questionCount: asNumber(q["question_count"]) ?? 0,
      },
    ];
  });

  const answered = rows(source["answered"]).flatMap((q) => {
    const publicId = asString(q["public_id"]);
    const title = asString(q["public_title"]);
    const outcomes = rows(q["outcomes"]).flatMap((o) => {
      const kind = OUTCOME_KINDS.find((k) => k === o["kind"]);
      const outcomeTitle = asString(o["title"]);
      const url = httpsUrl(o["url"]);
      const publishedAt = asString(o["published_at"]);
      if (!kind || !outcomeTitle || !url || !publishedAt) return [];
      return [{ kind, title: outcomeTitle, url, publishedAt, summary: asString(o["summary"]) }];
    });
    // An answered question with nothing to link to is not answered yet.
    if (!publicId || !title || outcomes.length === 0) return [];
    return [
      {
        publicId,
        title,
        askedBy: asString(q["asked_by"]),
        fromLabel: asString(q["from_label"]),
        contextLabel: asString(q["context_label"]),
        responseCount: asNumber(q["response_count"]) ?? 0,
        outcomes,
      },
    ];
  });

  return { open, answered };
}

/**
 * Turns a function's payload into the contract's response body. `reserve-answer` is shaped by the route, which
 * adds the signed upload address; here it returns the pieces it needs.
 */
export function shapeResponse(action: ListeningAction, payload: unknown): ShapedResponse {
  const refused = errorCodeFrom(payload);
  if (refused) return fail(refused);

  switch (action) {
    case "query": {
      const query = shapeQuery(payload);
      return query ? { ok: true, body: { query } } : fail("not_available");
    }
    case "hub":
      return { ok: true, body: { hub: shapeHub(payload) } };
    case "start": {
      if (!isObj(payload) || typeof payload["submission_id"] !== "string") return fail("unavailable");
      return { ok: true, body: { submissionId: payload["submission_id"], resumed: payload["resumed"] === true } };
    }
    case "progress": {
      // A null payload is a submission that is not this subject's, or does not exist: the two are not told apart.
      if (!isObj(payload)) return fail("not_found");
      const answers = Array.isArray(payload["answers"]) ? payload["answers"] : [];
      return {
        ok: true,
        body: {
          status: payload["status"] === "submitted" ? "submitted" : "in_progress",
          answers: answers.filter(isObj).map((a) => ({
            answerId: asString(a["answer_id"]) ?? "",
            questionId: asString(a["question_id"]),
            kind: a["kind"] === "text" ? "text" : "audio",
            status: a["status"] === "uploaded" || a["status"] === "failed" ? a["status"] : "pending",
            durationMs: asNumber(a["duration_ms"]),
            text: asString(a["text"]),
          })),
        },
      };
    }
    case "reserve-answer": {
      if (!isObj(payload) || typeof payload["answer_id"] !== "string" || typeof payload["storage_path"] !== "string") return fail("unavailable");
      return {
        ok: true,
        body: {
          answerId: payload["answer_id"],
          storagePath: payload["storage_path"],
          maxDurationSeconds: asNumber(payload["max_duration_seconds"]) ?? 120,
        },
      };
    }
    case "save-text-answer": {
      if (!isObj(payload) || typeof payload["answer_id"] !== "string") return fail("unavailable");
      return { ok: true, body: { answerId: payload["answer_id"] } };
    }
    case "finalize": {
      if (!isObj(payload) || payload["ok"] !== true) return fail("unavailable");
      return { ok: true, body: { answers: asNumber(payload["answers"]) ?? 0 } };
    }
    case "complete-answer":
    case "save-details":
    case "forget-subject":
      return isObj(payload) && payload["ok"] === true ? { ok: true, body: {} } : fail("unavailable");
  }
}

/** The HTTP status for each refusal. The body always carries the code; the status is for logs and proxies. */
export function statusForError(code: ListeningErrorCode): number {
  switch (code) {
    case "invalid_request":
      return 400;
    case "not_available":
    case "not_found":
      return 404;
    case "rate_limited":
      return 429;
    case "unavailable":
      return 503;
    default:
      // Rule refusals (closed, over a limit, consent missing): the request was understood and refused.
      return 422;
  }
}

/** Every code the contract names has a status; a test keeps this honest. */
export const ALL_ERROR_CODES = LISTENING_ERROR_CODES;

// -------------------------------------------------------------------------------------------------------------
// Rate limits: fixed windows counted in the database (al_site_rate_hit).

export interface RateRule {
  /** Which key the window is counted on. */
  by: "subject" | "client";
  limit: number;
  windowSeconds: number;
}

/**
 * Generous for a person, hostile to a script. A person answering five questions makes well under 60 calls in ten
 * minutes; a retried upload or a flaky connection adds some. The client (hashed address) limit is wider because
 * a table of people at one event may share an address. The unscoped read has only the client rule.
 */
export const RATE_RULES: Record<ListeningAction, RateRule[]> = {
  query: [{ by: "client", limit: 600, windowSeconds: 600 }],
  hub: [{ by: "client", limit: 600, windowSeconds: 600 }],
  start: [
    { by: "subject", limit: 20, windowSeconds: 600 },
    { by: "client", limit: 200, windowSeconds: 600 },
  ],
  progress: [{ by: "subject", limit: 120, windowSeconds: 600 }],
  "reserve-answer": [
    { by: "subject", limit: 40, windowSeconds: 600 },
    { by: "client", limit: 300, windowSeconds: 600 },
  ],
  "save-text-answer": [{ by: "subject", limit: 40, windowSeconds: 600 }],
  "complete-answer": [{ by: "subject", limit: 40, windowSeconds: 600 }],
  "save-details": [{ by: "subject", limit: 40, windowSeconds: 600 }],
  finalize: [{ by: "subject", limit: 10, windowSeconds: 600 }],
  "forget-subject": [{ by: "subject", limit: 5, windowSeconds: 600 }],
};

/** The keys to count for a request, in the form al_site_rate_hit stores. */
export function rateKeys(request: ParsedListeningRequest): { key: string; rule: RateRule }[] {
  const out: { key: string; rule: RateRule }[] = [];
  for (const rule of RATE_RULES[request.action]) {
    if (rule.by === "subject" && request.subjectKey) out.push({ key: `${request.action}|s|${request.subjectKey}`, rule });
    if (rule.by === "client" && request.clientHash) out.push({ key: `${request.action}|c|${request.clientHash}`, rule });
  }
  return out;
}

/**
 * Messages that create or change a submission need the tool switched on. `query` reports `closed` itself, `hub`
 * answers empty (al_site_hub checks the registry), and reading progress or erasing a subject stay possible.
 */
export function requiresEnabledTool(action: ListeningAction): boolean {
  return action !== "query" && action !== "hub" && action !== "forget-subject" && action !== "progress";
}
