// The pure half of the site's signed listening API: validate a request body, say which database function it
// calls and with what, turn the function's answer into the contract's response, and name the HTTP status and rate
// limit for each message. No Supabase, no Next, so it runs under Vitest. The server half is site-api.ts.
//
// The contract is packages/portal-contracts/src/listening.ts. The rules (open window, caps, consent, the question
// snapshot) live in the al_site_* SQL functions; nothing here reimplements them, it only refuses malformed input
// early and with a stable code.

import {
  LISTENING_ERROR_CODES,
  LISTENING_HOST_EXPECTED,
  LISTENING_HOST_KINDS,
  LISTENING_HOST_SEATS,
  LISTENING_INBOX_KINDS,
  LISTENING_CONVERSATION_STATUSES,
  LISTENING_MAX_SEGMENTS,
  LISTENING_PROMPT_KINDS,
  LISTENING_ROOM_ACTIONS,
  LISTENING_TABLE_EVENTS,
  LISTENING_TABLE_SESSION_LENGTH,
  LISTENING_TABLE_STATES,
  LISTENING_TABLE_TOKEN_LENGTH,
  MAX_CLIENT_HASH_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_INBOX_BODY_LENGTH,
  MAX_TEXT_ANSWER_LENGTH,
  isListeningErrorCode,
  isListeningSubject,
  type ListeningErrorCode,
  type ListeningHub,
  type ListeningConversation,
  type ListeningOutcomeKind,
  type ListeningPublicEvent,
  type ListeningRoom,
  type ListeningQuery,
  type ListeningSubject,
  type ListeningTable,
} from "@wuwf/portal-contracts";
import { hashJoinToken } from "@/lib/audience-listening/table-links";
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
  "inbox-send",
  "host-request",
  "event",
  "seat-save",
  "table-open",
  "table-state",
  "table-agree",
  "table-update",
  "table-segment",
  "table-segment-complete",
  "table-end",
  "conversation",
  "speakers-save",
  "highlights-save",
  "conversation-send",
  "contact-card-open",
  "contact-card-save",
  "room",
  "room-call",
  "room-claim",
  "kitchen-table-create",
] as const;
export type ListeningAction = (typeof LISTENING_ACTIONS)[number];

export function isListeningAction(value: string): value is ListeningAction {
  return (LISTENING_ACTIONS as readonly string[]).includes(value);
}

/** The messages a table's phone sends. They are authorised by a table session (or, for `table-open`, the link), not a subject. */
const TABLE_ACTIONS = [
  "table-open",
  "table-state",
  "table-agree",
  "table-update",
  "table-segment",
  "table-segment-complete",
  "table-end",
  "conversation",
  "speakers-save",
  "highlights-save",
  "conversation-send",
] as const satisfies readonly ListeningAction[];
export type TableAction = (typeof TABLE_ACTIONS)[number];
export function isTableAction(action: ListeningAction): action is TableAction {
  return (TABLE_ACTIONS as readonly string[]).includes(action);
}

const PUBLIC_ID = /^[a-z0-9]{16}$/;
const TOKEN_CHARS = /^[A-Za-z0-9_-]+$/;
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

  // A public event's page is the third public read.
  if (action === "event") {
    const publicId = body["publicId"];
    if (typeof publicId !== "string" || !PUBLIC_ID.test(publicId)) return BAD;
    return { ok: true, request: { action, subjectKey: null, clientHash, rpc: { fn: "al_site_event", args: { p_public_id: publicId } } } };
  }

  if (isTableAction(action)) return parseTableRequest(action, body, clientHash);

  // The table's second QR code names the table, not a person; reading what it opens needs no subject.
  if (action === "contact-card-open") {
    if (!isToken(body["cardToken"], LISTENING_TABLE_TOKEN_LENGTH)) return BAD;
    return {
      ok: true,
      request: { action, subjectKey: null, clientHash, rpc: { fn: "al_site_contact_card_open", args: { p_card_hash: hashJoinToken(body["cardToken"]) } } },
    };
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
    case "inbox-send": {
      const kind = LISTENING_INBOX_KINDS.find((k) => k === body["kind"]);
      const text = body["body"];
      const email = optionalEmail(body["email"]);
      if (!kind || typeof text !== "string" || email === undefined) return BAD;
      const trimmed = text.trim();
      if (trimmed.length === 0 || trimmed.length > MAX_INBOX_BODY_LENGTH) return BAD;
      return done({ fn: "al_site_inbox_send", args: { p_subject: key, p_kind: kind, p_body: trimmed, p_email: email } });
    }
    case "contact-card-save": {
      const firstName = required(body["firstName"], 60);
      const contact = str(body["contact"], 320);
      const mayContact = bool(body["mayContact"]);
      const mayName = bool(body["mayName"]);
      const keepAnonymous = bool(body["keepAnonymous"]);
      if (!isToken(body["cardToken"], LISTENING_TABLE_TOKEN_LENGTH) || !firstName || contact === undefined) return BAD;
      if (mayContact === null || mayName === null || keepAnonymous === null || (mayName && keepAnonymous)) return BAD;
      return done({
        fn: "al_site_contact_card_save",
        args: {
          p_card_hash: hashJoinToken(body["cardToken"]),
          p_subject: key,
          p_first_name: firstName,
          p_contact: contact?.trim() || null,
          p_may_contact: mayContact,
          p_may_name: mayName,
          p_keep_anonymous: keepAnonymous,
        },
      });
    }
    case "room":
    case "room-call": {
      // Only a site account that owns the event can run its room; the database checks the ownership.
      const eventPublicId = body["eventPublicId"];
      if ((body["subject"] as ListeningSubject).kind !== "account") return BAD;
      if (typeof eventPublicId !== "string" || !PUBLIC_ID.test(eventPublicId)) return BAD;
      if (action === "room") return done({ fn: "al_site_room", args: { p_subject: key, p_public_id: eventPublicId } });
      const roomAction = LISTENING_ROOM_ACTIONS.find((a) => a === body["action"]);
      if (!roomAction) return BAD;
      const needsValue = roomAction !== "last-call";
      const value = needsValue ? int(body["value"], 1, 100) : null;
      if (needsValue && value === null) return BAD;
      return done({ fn: "al_site_room_call", args: { p_subject: key, p_public_id: eventPublicId, p_action: roomAction, p_value: value } });
    }
    case "room-claim": {
      // An organizer link is redeemed by a site account; only its hash reaches the database.
      if ((body["subject"] as ListeningSubject).kind !== "account") return BAD;
      if (!isToken(body["claimToken"], LISTENING_TABLE_TOKEN_LENGTH)) return BAD;
      return done({ fn: "al_site_room_claim", args: { p_subject: key, p_claim_hash: hashJoinToken(body["claimToken"]) } });
    }
    case "kitchen-table-create": {
      // The link's token is made by the route, which puts its hash here; the parser leaves it empty, as for a table's session.
      const campaignPublicId = body["campaignPublicId"];
      const hostName = str(body["hostName"], 120);
      const place = str(body["place"], 200);
      const startsAt = optionalInstant(body["startsAt"]);
      if (typeof campaignPublicId !== "string" || !PUBLIC_ID.test(campaignPublicId) || hostName === undefined || place === undefined || startsAt === undefined) return BAD;
      return done({
        fn: "al_site_kitchen_table_create",
        args: { p_subject: key, p_campaign_public_id: campaignPublicId, p_link_hash: null, p_host_name: hostName?.trim() || null, p_place: place?.trim() || null, p_starts_at: startsAt },
      });
    }
    case "seat-save": {
      const publicId = body["publicId"];
      const name = required(body["name"], 200);
      const email = optionalEmail(body["email"]);
      if (typeof publicId !== "string" || !PUBLIC_ID.test(publicId) || !name || !email) return BAD;
      return done({ fn: "al_site_seat_save", args: { p_subject: key, p_public_id: publicId, p_name: name, p_email: email } });
    }
    case "host-request": {
      const kind = LISTENING_HOST_KINDS.find((k) => k === body["kind"]);
      const seats = LISTENING_HOST_SEATS.find((n) => n === body["seats"]);
      const expected = LISTENING_HOST_EXPECTED.find((e) => e === body["expected"]);
      const name = required(body["name"], 200);
      const email = optionalEmail(body["email"]);
      const address = required(body["address"], 500);
      const whenText = required(body["whenText"], 500);
      const organization = str(body["organization"], 200);
      const invitees = str(body["inviteesText"], 2000);
      const journalist = bool(body["journalistRequested"]);
      if (!kind || !seats || !expected || !name || !email || !address || !whenText) return BAD;
      if (organization === undefined || invitees === undefined || journalist === null) return BAD;
      return done({
        fn: "al_site_host_request",
        args: {
          p_subject: key,
          p_name: name,
          p_email: email,
          p_kind: kind,
          p_organization: organization?.trim() || null,
          p_seats: seats,
          p_address: address,
          p_expected: expected,
          p_when_text: whenText,
          p_invitees_text: invitees?.trim() || null,
          p_journalist_requested: journalist,
        },
      });
    }
  }
}

function isToken(value: unknown, length: number): value is string {
  return typeof value === "string" && value.length === length && TOKEN_CHARS.test(value);
}
function int(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/**
 * A table's phone sends the link token once (`table-open`) and then its session token. Both are hashed here, so the database only
 * ever sees SHA-256 and the token never reaches a function argument, a log or a query plan. The rate limit counts the session's hash
 * prefix in place of a subject. `table-open`'s session hash is made by the route, which is why it starts out null here.
 */
function parseTableRequest(action: TableAction, body: Obj, clientHash: string | null): ParseResult {
  const done = (key: string, rpc: ParsedListeningRequest["rpc"], extra: Partial<ParsedListeningRequest> = {}): ParseResult => ({
    ok: true,
    request: { action, subjectKey: key, clientHash, rpc, ...extra },
  });

  if (action === "table-open") {
    if (!isToken(body["linkToken"], LISTENING_TABLE_TOKEN_LENGTH)) return BAD;
    const hash = hashJoinToken(body["linkToken"]);
    return done(`table:link:${hash.slice(0, 24)}`, { fn: "al_site_table_open", args: { p_link_hash: hash, p_session_hash: null } });
  }

  if (!isToken(body["session"], LISTENING_TABLE_SESSION_LENGTH)) return BAD;
  const hash = hashJoinToken(body["session"]);
  const key = `table:${hash.slice(0, 24)}`;

  switch (action) {
    case "table-state":
      return done(key, { fn: "al_site_table_state", args: { p_session_hash: hash } });
    case "table-agree": {
      const version = int(body["consentVersion"], 1, 1_000_000);
      const name = str(body["firstName"], 60);
      // The facilitator's email is how WUWF sends them the after-page link. It is required; the database checks it again.
      const email = optionalEmail(body["email"]);
      // How many are at the table is optional; a number outside 1 to 40 is refused rather than ignored.
      const rawPeople = body["people"];
      const people = rawPeople === undefined || rawPeople === null ? null : int(rawPeople, 1, 40);
      if (version === null || name === undefined || !email || (rawPeople !== undefined && rawPeople !== null && people === null)) return BAD;
      return done(key, {
        fn: "al_site_table_agree",
        args: { p_session_hash: hash, p_consent_version: version, p_first_name: name?.trim() || null, p_email: email, p_people: people },
      });
    }
    case "table-update": {
      const event = LISTENING_TABLE_EVENTS.find((e) => e === body["event"]);
      if (!event) return BAD;
      let prompt: number | null = null;
      if (event === "prompt") {
        prompt = int(body["promptPosition"], 1, 100);
        if (prompt === null) return BAD;
      }
      return done(key, { fn: "al_site_table_update", args: { p_session_hash: hash, p_event: event, p_prompt: prompt } });
    }
    case "table-segment": {
      const seq = int(body["seq"], 0, LISTENING_MAX_SEGMENTS - 1);
      const raw = body["contentType"];
      if (seq === null || typeof raw !== "string" || raw.length > 100) return BAD;
      const contentType = normalizeContentType(raw);
      if (!isAllowedAnswerType(contentType)) return BAD;
      return done(key, { fn: "al_site_table_segment", args: { p_session_hash: hash, p_seq: seq, p_content_type: contentType } }, { contentType });
    }
    case "table-segment-complete": {
      const seq = int(body["seq"], 0, LISTENING_MAX_SEGMENTS - 1);
      const size = int(body["sizeBytes"], 1, MAX_ANSWER_BYTES);
      const duration = int(body["durationMs"], 0, MAX_DURATION_MS);
      const startedAt = optionalInstant(body["startedAt"]);
      if (seq === null || size === null || duration === null || startedAt === undefined) return BAD;
      return done(key, {
        fn: "al_site_table_segment_complete",
        args: { p_session_hash: hash, p_seq: seq, p_size_bytes: size, p_duration_ms: duration, p_started_at: startedAt },
      });
    }
    case "table-end": {
      const lastSeq = int(body["lastSeq"], -1, LISTENING_MAX_SEGMENTS - 1);
      if (lastSeq === null) return BAD;
      return done(key, { fn: "al_site_table_end", args: { p_session_hash: hash, p_last_seq: lastSeq } });
    }
    case "conversation":
      return done(key, { fn: "al_site_conversation", args: { p_session_hash: hash } });
    case "conversation-send":
      return done(key, { fn: "al_site_conversation_send", args: { p_session_hash: hash } });
    case "speakers-save": {
      const list = body["speakers"];
      if (!Array.isArray(list) || list.length > 40) return BAD;
      const speakers: Obj[] = [];
      for (const raw of list) {
        if (!isObj(raw)) return BAD;
        const id = uuid(raw["id"]);
        const name = str(raw["name"], 60);
        const facilitator = bool(raw["isFacilitator"]);
        const into = raw["mergedInto"] === null || raw["mergedInto"] === undefined ? null : uuid(raw["mergedInto"]);
        if (!id || name === undefined || facilitator === null || (raw["mergedInto"] != null && !into)) return BAD;
        speakers.push({ id, name: name?.trim() || null, isFacilitator: facilitator, mergedInto: into });
      }
      return done(key, { fn: "al_site_speakers_save", args: { p_session_hash: hash, p_speakers: speakers } });
    }
    case "highlights-save": {
      const list = body["highlights"];
      if (!Array.isArray(list) || list.length > 100) return BAD;
      const highlights: Obj[] = [];
      for (const raw of list) {
        if (!isObj(raw)) return BAD;
        const startMs = int(raw["startMs"], 0, 24 * 60 * 60 * 1000);
        const tag = str(raw["tag"], 40);
        if (startMs === null || tag === undefined) return BAD;
        highlights.push({ startMs, tag: tag?.trim() || null });
      }
      return done(key, { fn: "al_site_highlights_save", args: { p_session_hash: hash, p_highlights: highlights } });
    }
  }
}

/** A required text field: trimmed, 1 to `max` characters. Null when missing, not a string, blank or too long. */
function required(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** An email that may be absent: undefined when present but not an address, null when absent or blank, else the address. */
function optionalEmail(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length <= MAX_EMAIL_LENGTH && EMAIL_SHAPE.test(trimmed) ? trimmed : undefined;
}

/** An instant that may be absent: undefined when present but not a time, null when absent or blank, else the ISO string. */
function optionalInstant(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 40) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
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

  const events = rows(source["events"]).flatMap((e) => {
    const publicId = asString(e["public_id"]);
    const title = asString(e["title"]);
    const startsAt = asString(e["starts_at"]);
    const endsAt = asString(e["ends_at"]);
    const placeName = asString(e["place_name"]);
    if (!publicId || !title || !startsAt || !endsAt || !placeName) return [];
    return [{ publicId, title, startsAt, endsAt, placeName, city: asString(e["city"]), organizerLabel: asString(e["organizer_label"]), seatsLeft: asNumber(e["seats_left"]) }];
  });

  const kitchenCampaigns = rows(source["kitchen_campaigns"]).flatMap((k) => {
    const publicId = asString(k["public_id"]);
    const title = asString(k["title"]);
    const question = asString(k["question"]);
    return publicId && title && question ? [{ publicId, title, question }] : [];
  });

  return { open, answered, events, kitchenCampaigns };
}

const PROMPT_KINDS = LISTENING_PROMPT_KINDS;

/** Maps the table view the database builds onto the contract's ListeningTable. A malformed prompt is dropped, not passed on half-formed. */
export function shapeTable(payload: unknown): ListeningTable | null {
  if (!isObj(payload)) return null;
  const number = asNumber(payload["number"]);
  const state = LISTENING_TABLE_STATES.find((st) => st === payload["state"]);
  if (number === null || !state) return null;
  const consent = isObj(payload["consent"]) ? payload["consent"] : null;
  const consentVersion = consent ? asNumber(consent["version"]) : null;
  const consentText = consent ? asString(consent["text"]) : null;
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  return {
    number,
    state,
    eventTitle: asString(payload["event_title"]) ?? "",
    placeName: asString(payload["place_name"]) ?? "",
    question: asString(payload["question"]) ?? "",
    consent: consentVersion !== null && consentText ? { version: consentVersion, text: consentText } : null,
    prompts: list(payload["prompts"]).filter(isObj).flatMap((p) => {
      const kind = PROMPT_KINDS.find((k) => k === p["kind"]);
      const text = asString(p["text"]);
      const position = asNumber(p["position"]);
      if (!kind || !text || position === null) return [];
      return [{ position, kind, text, hint: asString(p["hint"]), suggestedSeconds: asNumber(p["suggested_seconds"]) }];
    }),
    tags: list(payload["tags"]).filter((t): t is string => typeof t === "string"),
    promptPosition: asNumber(payload["prompt_position"]) ?? 1,
    facilitatorFirstName: asString(payload["facilitator_first_name"]),
    helpRequested: payload["help_requested"] === true,
    uploadedSeqs: list(payload["uploaded_seqs"]).filter((n): n is number => typeof n === "number"),
    eventPromptPosition: asNumber(payload["event_prompt_position"]) ?? 1,
    lastCallAt: asString(payload["last_call_at"]),
    helpAvailable: payload["help_available"] === true,
  };
}

const STATUSES = LISTENING_CONVERSATION_STATUSES;

/** Maps al_site_conversation's payload onto the contract. A malformed line, voice or highlight is dropped, not passed on half-formed. */
export function shapeConversation(payload: unknown): ListeningConversation | null {
  if (!isObj(payload)) return null;
  const status = STATUSES.find((st) => st === payload["status"]);
  if (!status) return null;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter(isObj) : []);
  return {
    status,
    transcriptReady: payload["transcript_ready"] === true,
    tags: (Array.isArray(payload["tags"]) ? payload["tags"] : []).filter((t): t is string => typeof t === "string"),
    lines: list(payload["lines"]).flatMap((l) => {
      const startMs = asNumber(l["start_ms"]);
      const endMs = asNumber(l["end_ms"]);
      const text = asString(l["text"]);
      return startMs === null || endMs === null || text === null ? [] : [{ startMs, endMs, text, speakerId: asString(l["speaker_id"]) }];
    }),
    speakers: list(payload["speakers"]).flatMap((sp) => {
      const id = asString(sp["id"]);
      const label = asString(sp["label"]);
      return !id || !label
        ? []
        : [
            {
              id,
              label,
              name: asString(sp["name"]),
              isFacilitator: sp["is_facilitator"] === true,
              firstHeardMs: asNumber(sp["first_heard_ms"]) ?? 0,
              sharePercent: asNumber(sp["share_percent"]) ?? 0,
              mergedInto: asString(sp["merged_into"]),
              suggestedName: asString(sp["suggested_name"]),
            },
          ];
    }),
    highlights: list(payload["highlights"]).flatMap((h) => {
      const startMs = asNumber(h["start_ms"]);
      const endMs = asNumber(h["end_ms"]);
      const text = asString(h["text"]);
      return startMs === null || endMs === null || text === null
        ? []
        : [{ startMs, endMs, text, tag: asString(h["tag"]), speakerId: asString(h["speaker_id"]) }];
    }),
    proposals: (Array.isArray(payload["proposals"]) ? payload["proposals"] : []).filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0),
    contactCardCount: asNumber(payload["contact_card_count"]) ?? 0,
  };
}

/** Maps the organizer's room view. It carries a table's state and never what was said at it. */
export function shapeRoom(payload: unknown): ListeningRoom | null {
  if (!isObj(payload)) return null;
  const title = asString(payload["title"]);
  const startsAt = asString(payload["starts_at"]);
  const endsAt = asString(payload["ends_at"]);
  if (!title || !startsAt || !endsAt) return null;
  const list = (value: unknown) => (Array.isArray(value) ? value.filter(isObj) : []);
  return {
    title,
    status: payload["status"] === "live" ? "live" : "scheduled",
    startsAt,
    endsAt,
    currentPromptPosition: asNumber(payload["current_prompt_position"]) ?? 1,
    lastCallAt: asString(payload["last_call_at"]),
    prompts: list(payload["prompts"]).flatMap((p) => {
      const kind = PROMPT_KINDS.find((k) => k === p["kind"]);
      const text = asString(p["text"]);
      const position = asNumber(p["position"]);
      return !kind || !text || position === null ? [] : [{ position, kind, text, suggestedSeconds: asNumber(p["suggested_seconds"]) }];
    }),
    tables: list(payload["tables"]).flatMap((t) => {
      const number = asNumber(t["number"]);
      const state = LISTENING_TABLE_STATES.find((st) => st === t["state"]);
      return number === null || !state
        ? []
        : [
            {
              number,
              state,
              promptPosition: asNumber(t["prompt_position"]) ?? 1,
              helpRequested: t["help_requested"] === true,
              facilitatorFirstName: asString(t["facilitator_first_name"]),
            },
          ];
    }),
  };
}

/** Maps al_site_event's payload onto the contract's ListeningPublicEvent. Null for an event that is not listed. */
export function shapeEvent(payload: unknown): ListeningPublicEvent | null {
  if (!isObj(payload)) return null;
  const publicId = asString(payload["public_id"]);
  const title = asString(payload["title"]);
  const startsAt = asString(payload["starts_at"]);
  const endsAt = asString(payload["ends_at"]);
  const placeName = asString(payload["place_name"]);
  if (!publicId || !title || !startsAt || !endsAt || !placeName) return null;
  return {
    publicId,
    title,
    startsAt,
    endsAt,
    placeName,
    address: asString(payload["address"]),
    city: asString(payload["city"]),
    organizerLabel: asString(payload["organizer_label"]),
    journalistJoining: payload["journalist_joining"] === true,
    seatsLeft: asNumber(payload["seats_left"]),
  };
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
    case "event": {
      const event = shapeEvent(payload);
      return event ? { ok: true, body: { event } } : fail("not_available");
    }
    case "table-open": {
      const table = isObj(payload) ? shapeTable(payload["table"]) : null;
      const expiresAt = isObj(payload) ? asString(payload["session_expires_at"]) : null;
      return table && expiresAt ? { ok: true, body: { table, sessionExpiresAt: expiresAt } } : fail("unavailable");
    }
    case "table-state":
    case "table-agree":
    case "table-update": {
      const table = isObj(payload) ? shapeTable(payload["table"]) : null;
      return table ? { ok: true, body: { table } } : fail("unavailable");
    }
    case "table-segment": {
      if (!isObj(payload) || asNumber(payload["seq"]) === null) return fail("unavailable");
      if (payload["already_uploaded"] === true) return { ok: true, body: { seq: payload["seq"], alreadyUploaded: true } };
      if (typeof payload["storage_path"] !== "string") return fail("unavailable");
      return {
        ok: true,
        body: { seq: payload["seq"], storagePath: payload["storage_path"], maxSegmentSeconds: asNumber(payload["max_segment_seconds"]) ?? 300 },
      };
    }
    case "conversation": {
      const conversation = shapeConversation(payload);
      return conversation ? { ok: true, body: { conversation } } : fail("unavailable");
    }
    case "room":
    case "room-call": {
      const room = isObj(payload) ? shapeRoom(payload["room"]) : null;
      return room ? { ok: true, body: { room } } : fail("unavailable");
    }
    case "kitchen-table-create": {
      if (!isObj(payload)) return fail("unavailable");
      const eventPublicId = asString(payload["event_public_id"]);
      const title = asString(payload["title"]);
      const question = asString(payload["question"]);
      return eventPublicId && title && question ? { ok: true, body: { eventPublicId, title, question } } : fail("unavailable");
    }
    case "room-claim": {
      const publicId = isObj(payload) ? asString(payload["public_id"]) : null;
      return publicId ? { ok: true, body: { eventPublicId: publicId } } : fail("unavailable");
    }
    case "contact-card-open": {
      if (!isObj(payload) || asString(payload["event_title"]) === null || asNumber(payload["table_number"]) === null) return fail("unavailable");
      return { ok: true, body: { eventTitle: payload["event_title"], tableNumber: payload["table_number"] } };
    }
    case "table-end": {
      if (!isObj(payload) || typeof payload["complete"] !== "boolean") return fail("unavailable");
      const missing = Array.isArray(payload["missing"]) ? payload["missing"].filter((n): n is number => typeof n === "number") : [];
      return { ok: true, body: { complete: payload["complete"], missing } };
    }
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
    case "table-segment-complete":
    case "speakers-save":
    case "highlights-save":
    case "conversation-send":
    case "contact-card-save":
    case "seat-save":
    case "save-details":
    case "forget-subject":
    case "inbox-send":
    case "host-request":
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
  // Open to anyone with no account, so tighter: a person sends a few in an hour; a script sends hundreds. The client limit is
  // wider than the subject's because a table of people at an event may share an address.
  "inbox-send": [
    { by: "subject", limit: 5, windowSeconds: 3600 },
    { by: "client", limit: 30, windowSeconds: 3600 },
  ],
  "host-request": [
    { by: "subject", limit: 3, windowSeconds: 3600 },
    { by: "client", limit: 15, windowSeconds: 3600 },
  ],
  event: [{ by: "client", limit: 600, windowSeconds: 600 }],
  // Saving a seat asks for a name and an email, so it is as tight as the other no-account forms.
  "seat-save": [
    { by: "subject", limit: 5, windowSeconds: 3600 },
    { by: "client", limit: 60, windowSeconds: 3600 },
  ],
  // A table's link is guessed against, so the client limit is the one that matters; a table of phones may share an address.
  "table-open": [
    { by: "subject", limit: 20, windowSeconds: 600 },
    { by: "client", limit: 120, windowSeconds: 600 },
  ],
  // A recording phone polls and sends a segment every five minutes; these allow that with plenty of room for retries.
  "table-state": [{ by: "subject", limit: 600, windowSeconds: 600 }],
  "table-agree": [{ by: "subject", limit: 30, windowSeconds: 600 }],
  "table-update": [{ by: "subject", limit: 120, windowSeconds: 600 }],
  "table-segment": [{ by: "subject", limit: 120, windowSeconds: 600 }],
  "table-segment-complete": [{ by: "subject", limit: 120, windowSeconds: 600 }],
  "table-end": [{ by: "subject", limit: 30, windowSeconds: 600 }],
  // The after-page is read, edited and saved by one facilitator.
  conversation: [{ by: "subject", limit: 120, windowSeconds: 600 }],
  "speakers-save": [{ by: "subject", limit: 60, windowSeconds: 600 }],
  "highlights-save": [{ by: "subject", limit: 120, windowSeconds: 600 }],
  "conversation-send": [{ by: "subject", limit: 10, windowSeconds: 600 }],
  // Open to anyone with the card, so tighter than the table's own calls: a person leaves one, and edits it a few times.
  "contact-card-open": [{ by: "client", limit: 300, windowSeconds: 600 }],
  "contact-card-save": [
    { by: "subject", limit: 10, windowSeconds: 3600 },
    { by: "client", limit: 120, windowSeconds: 3600 },
  ],
  // The organizer's console polls; the limit is generous for that and still bounded per account.
  room: [{ by: "subject", limit: 600, windowSeconds: 600 }],
  "room-call": [{ by: "subject", limit: 120, windowSeconds: 600 }],
  // A claim link is a 256-bit secret, so guessing is not the worry; a few tries by one account and many by one address is plenty.
  "room-claim": [
    { by: "subject", limit: 10, windowSeconds: 3600 },
    { by: "client", limit: 60, windowSeconds: 3600 },
  ],
  // Starting a kitchen table makes an event: a few a day per host (the database allows three), and per address.
  "kitchen-table-create": [
    { by: "subject", limit: 8, windowSeconds: 86400 },
    { by: "client", limit: 30, windowSeconds: 86400 },
  ],
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
