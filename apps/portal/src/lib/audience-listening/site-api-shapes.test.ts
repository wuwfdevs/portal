import { describe, expect, it } from "vitest";
import { LISTENING_ERROR_CODES, LISTENING_PATHS } from "@wuwf/portal-contracts";
import {
  LISTENING_ACTIONS,
  RATE_RULES,
  errorCodeFrom,
  isListeningAction,
  parseListeningRequest,
  rateKeys,
  requiresEnabledTool,
  shapeHub,
  shapeQuery,
  shapeResponse,
  statusForError,
  subjectKey,
} from "./site-api-shapes";

const SUBJECT = { kind: "visitor", id: "v_8f3a-91c2" } as const;
const SUB = "11111111-1111-4111-8111-111111111111";
const Q = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";
const PUBLIC_ID = "abcd1234efgh5678";

function ok(action: Parameters<typeof parseListeningRequest>[0], body: unknown) {
  const r = parseListeningRequest(action, body);
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.request;
}

describe("actions", () => {
  it("are exactly the contract's paths", () => {
    const fromPaths = Object.values(LISTENING_PATHS).map((p) => p.replace("/api/site/listening/", ""));
    expect([...LISTENING_ACTIONS].sort()).toEqual(fromPaths.sort());
  });

  it("recognises only known actions", () => {
    expect(isListeningAction("finalize")).toBe(true);
    expect(isListeningAction("drop-table")).toBe(false);
  });
});

describe("subjectKey", () => {
  it("namespaces the site's id so it cannot collide with anything else", () => {
    expect(subjectKey(SUBJECT)).toBe("site:visitor:v_8f3a-91c2");
    expect(subjectKey({ kind: "account", id: "abc" })).toBe("site:account:abc");
  });
});

describe("parseListeningRequest", () => {
  it("reads a query by public id and carries no subject", () => {
    const r = ok("query", { publicId: PUBLIC_ID });
    expect(r.subjectKey).toBeNull();
    expect(r.rpc).toEqual({ fn: "al_site_query", args: { p_public_id: PUBLIC_ID } });
  });

  it("refuses a malformed public id, so nothing odd reaches a query", () => {
    expect(parseListeningRequest("query", { publicId: "ABC" }).ok).toBe(false);
    expect(parseListeningRequest("query", { publicId: "abcd1234efgh567'" }).ok).toBe(false);
    expect(parseListeningRequest("query", {}).ok).toBe(false);
  });

  it("builds the subject key itself and never trusts one sent in the body", () => {
    const r = ok("start", { subject: SUBJECT, publicId: PUBLIC_ID });
    expect(r.rpc.args).toEqual({ p_subject: "site:visitor:v_8f3a-91c2", p_public_id: PUBLIC_ID });
    const spoof = parseListeningRequest("start", { subject: SUBJECT, p_subject: "site:account:other", publicId: PUBLIC_ID });
    expect(spoof.ok && spoof.request.rpc.args["p_subject"]).toBe("site:visitor:v_8f3a-91c2");
  });

  it("refuses a missing, malformed or email-shaped subject", () => {
    expect(parseListeningRequest("start", { publicId: PUBLIC_ID }).ok).toBe(false);
    expect(parseListeningRequest("start", { subject: { kind: "visitor", id: "a@b.org" }, publicId: PUBLIC_ID }).ok).toBe(false);
    expect(parseListeningRequest("start", { subject: { kind: "robot", id: "x" }, publicId: PUBLIC_ID }).ok).toBe(false);
  });

  it("refuses non-objects and bad ids", () => {
    expect(parseListeningRequest("progress", null).ok).toBe(false);
    expect(parseListeningRequest("progress", []).ok).toBe(false);
    expect(parseListeningRequest("progress", { subject: SUBJECT, submissionId: "not-a-uuid" }).ok).toBe(false);
  });

  it("accepts a client hash only in a safe shape", () => {
    expect(ok("progress", { subject: SUBJECT, submissionId: SUB, clientHash: "a1B2_c-3" }).clientHash).toBe("a1B2_c-3");
    expect(parseListeningRequest("progress", { subject: SUBJECT, submissionId: SUB, clientHash: "1.2.3.4" }).ok).toBe(false);
    expect(parseListeningRequest("progress", { subject: SUBJECT, submissionId: SUB, clientHash: "a".repeat(129) }).ok).toBe(false);
    expect(parseListeningRequest("progress", { subject: SUBJECT, submissionId: SUB, clientHash: "" }).ok).toBe(false);
  });

  it("reserves an answer with the codec parameters stripped, and refuses types the bucket would refuse", () => {
    const r = ok("reserve-answer", { subject: SUBJECT, submissionId: SUB, questionId: Q, contentType: "audio/webm;codecs=opus" });
    expect(r.contentType).toBe("audio/webm");
    expect(r.rpc.args["p_content_type"]).toBe("audio/webm");
    expect(parseListeningRequest("reserve-answer", { subject: SUBJECT, submissionId: SUB, questionId: Q, contentType: "video/mp4" }).ok).toBe(false);
    expect(parseListeningRequest("reserve-answer", { subject: SUBJECT, submissionId: SUB, questionId: Q, contentType: 7 }).ok).toBe(false);
  });

  it("trims a written answer and refuses an empty or over-long one", () => {
    expect(ok("save-text-answer", { subject: SUBJECT, submissionId: SUB, questionId: Q, text: "  hello  " }).rpc.args["p_text"]).toBe("hello");
    expect(parseListeningRequest("save-text-answer", { subject: SUBJECT, submissionId: SUB, questionId: Q, text: "   " }).ok).toBe(false);
    expect(parseListeningRequest("save-text-answer", { subject: SUBJECT, submissionId: SUB, questionId: Q, text: "x".repeat(4001) }).ok).toBe(false);
    expect(parseListeningRequest("save-text-answer", { subject: SUBJECT, submissionId: SUB, questionId: Q, text: "x".repeat(4000) }).ok).toBe(true);
  });

  it("completes an answer within the size cap, with an optional duration", () => {
    expect(ok("complete-answer", { subject: SUBJECT, answerId: A, sizeBytes: 1000, durationMs: 5000 }).rpc.args).toMatchObject({
      p_size_bytes: 1000,
      p_duration_ms: 5000,
    });
    expect(ok("complete-answer", { subject: SUBJECT, answerId: A, sizeBytes: 1000, durationMs: null }).rpc.args["p_duration_ms"]).toBeNull();
    expect(ok("complete-answer", { subject: SUBJECT, answerId: A, sizeBytes: 1000 }).rpc.args["p_duration_ms"]).toBeNull();
    for (const bad of [0, -1, 1.5, 50 * 1024 * 1024 + 1, "10"]) {
      expect(parseListeningRequest("complete-answer", { subject: SUBJECT, answerId: A, sizeBytes: bad }).ok).toBe(false);
    }
    expect(parseListeningRequest("complete-answer", { subject: SUBJECT, answerId: A, sizeBytes: 5, durationMs: -1 }).ok).toBe(false);
  });

  it("saves details with three separate consent booleans and bounded fields", () => {
    const body = {
      subject: SUBJECT,
      submissionId: SUB,
      details: { name: "Dana", email: null, phone: null, city: "Milton", note: null },
      consent: { contact: true, identify: false, requestAnonymous: false },
    };
    const r = ok("save-details", body);
    expect(r.rpc.args).toMatchObject({ p_name: "Dana", p_email: null, p_city: "Milton", p_consent_contact: true, p_consent_identify: false });
    expect(parseListeningRequest("save-details", { ...body, consent: { contact: "yes", identify: false, requestAnonymous: false } }).ok).toBe(false);
    expect(parseListeningRequest("save-details", { ...body, consent: { contact: true } }).ok).toBe(false);
    expect(parseListeningRequest("save-details", { ...body, details: { ...body.details, name: "x".repeat(201) } }).ok).toBe(false);
    expect(parseListeningRequest("save-details", { ...body, details: { ...body.details, note: 5 } }).ok).toBe(false);
  });

  it("finalizes only with an explicit boolean for the terms", () => {
    expect(ok("finalize", { subject: SUBJECT, submissionId: SUB, consentAgreed: true }).rpc.args["p_consent_agreed"]).toBe(true);
    expect(parseListeningRequest("finalize", { subject: SUBJECT, submissionId: SUB }).ok).toBe(false);
    expect(parseListeningRequest("finalize", { subject: SUBJECT, submissionId: SUB, consentAgreed: "true" }).ok).toBe(false);
  });

  it("forgets a subject by the key it built", () => {
    expect(ok("forget-subject", { subject: SUBJECT }).rpc).toEqual({ fn: "al_site_forget_subject", args: { p_subject: "site:visitor:v_8f3a-91c2" } });
  });
});

describe("errorCodeFrom", () => {
  it("passes through a code the contract names", () => {
    expect(errorCodeFrom({ error: "consent_required" })).toBe("consent_required");
    expect(errorCodeFrom({ error: "submission_limit" })).toBe("submission_limit");
  });

  it("maps an unauthenticated session to a bad request and anything unknown to the Portal's own failure", () => {
    expect(errorCodeFrom({ error: "unauthenticated" })).toBe("invalid_request");
    expect(errorCodeFrom({ error: "mystery" })).toBe("unavailable");
  });

  it("is null when there is no refusal", () => {
    expect(errorCodeFrom({ ok: true })).toBeNull();
    expect(errorCodeFrom(null)).toBeNull();
  });
});

describe("shapeQuery", () => {
  const payload = {
    public_id: PUBLIC_ID,
    public_title: "Rebuilding after Isaias",
    public_intro: "Tell us.",
    asked_by: "WUWF News desk",
    from_label: null,
    context_label: "After Isaias",
    allow_text_answers: true,
    state: "open",
    opens_at: null,
    closes_at: "2026-11-30T00:00:00Z",
    consent_text: "Terms.",
    ask_contact_permission: true,
    ask_attribution_permission: true,
    allow_anonymous_request: true,
    fields: { name: "optional", email: "optional", phone: "hidden", city: "optional", note: "weird" },
    questions: [{ id: Q, position: 1, prompt: "What were you told?", guidance: null, required: true, max_duration_seconds: 120 }],
  };

  it("maps every field to the contract's names", () => {
    const q = shapeQuery(payload)!;
    expect(q).toMatchObject({
      publicId: PUBLIC_ID,
      title: "Rebuilding after Isaias",
      askedBy: "WUWF News desk",
      contextLabel: "After Isaias",
      allowTextAnswers: true,
      state: "open",
      closesAt: "2026-11-30T00:00:00Z",
    });
    expect(q.questions).toEqual([{ id: Q, position: 1, prompt: "What were you told?", guidance: null, required: true, maxDurationSeconds: 120 }]);
  });

  it("treats an unknown field mode as hidden and an unknown state as closed", () => {
    const q = shapeQuery({ ...payload, state: "banana" })!;
    expect(q.fields.note).toBe("hidden");
    expect(q.state).toBe("closed");
  });

  it("is null for a draft or unknown id, which the function returns as null", () => {
    expect(shapeQuery(null)).toBeNull();
  });

  it("never carries an internal field it was not given", () => {
    const q = shapeQuery({ ...payload, internal_notes: "secret", internal_title: "secret" })!;
    expect(JSON.stringify(q)).not.toContain("secret");
  });
});

describe("shapeResponse", () => {
  it("answers an unknown or draft query as not_available, the same for both", () => {
    expect(shapeResponse("query", null)).toEqual({ ok: false, error: "not_available" });
  });

  it("answers a submission that is not the subject's as not_found", () => {
    expect(shapeResponse("progress", null)).toEqual({ ok: false, error: "not_found" });
  });

  it("returns a started submission and whether it resumed", () => {
    expect(shapeResponse("start", { submission_id: SUB, resumed: true })).toEqual({ ok: true, body: { submissionId: SUB, resumed: true } });
  });

  it("returns progress with kinds and a written answer's words", () => {
    const r = shapeResponse("progress", {
      status: "in_progress",
      answers: [
        { answer_id: A, question_id: Q, kind: "text", status: "uploaded", duration_ms: null, text: "Hi" },
        { answer_id: SUB, question_id: null, kind: "audio", status: "pending", duration_ms: 1200, text: null },
      ],
    });
    expect(r).toEqual({
      ok: true,
      body: {
        status: "in_progress",
        answers: [
          { answerId: A, questionId: Q, kind: "text", status: "uploaded", durationMs: null, text: "Hi" },
          { answerId: SUB, questionId: null, kind: "audio", status: "pending", durationMs: 1200, text: null },
        ],
      },
    });
  });

  it("passes a rule refusal through unchanged", () => {
    expect(shapeResponse("finalize", { error: "required_answer_missing" })).toEqual({ ok: false, error: "required_answer_missing" });
  });

  it("does not report success for a payload that is not the success shape", () => {
    expect(shapeResponse("finalize", { ok: false })).toEqual({ ok: false, error: "unavailable" });
    expect(shapeResponse("complete-answer", null)).toEqual({ ok: false, error: "unavailable" });
    expect(shapeResponse("start", { nope: 1 })).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("statusForError", () => {
  it("gives every code in the contract a sensible status", () => {
    for (const code of LISTENING_ERROR_CODES) {
      const status = statusForError(code);
      expect([400, 404, 422, 429, 503]).toContain(status);
    }
    expect(statusForError("rate_limited")).toBe(429);
    expect(statusForError("not_found")).toBe(404);
    expect(statusForError("unavailable")).toBe(503);
    expect(statusForError("consent_required")).toBe(422);
  });
});

describe("rate limits", () => {
  it("define a rule for every action", () => {
    for (const action of LISTENING_ACTIONS) expect(RATE_RULES[action].length).toBeGreaterThan(0);
  });

  it("count a subject's calls per action and the client's separately", () => {
    const r = ok("start", { subject: SUBJECT, publicId: PUBLIC_ID, clientHash: "h1" });
    const keys = rateKeys(r).map((k) => k.key);
    expect(keys).toContain("start|s|site:visitor:v_8f3a-91c2");
    expect(keys).toContain("start|c|h1");
  });

  it("skips the client rule when the site sent no client hash, but still limits the subject", () => {
    const keys = rateKeys(ok("start", { subject: SUBJECT, publicId: PUBLIC_ID })).map((k) => k.key);
    expect(keys).toEqual(["start|s|site:visitor:v_8f3a-91c2"]);
  });

  it("limits the public read by client only, since it has no subject", () => {
    expect(rateKeys(ok("query", { publicId: PUBLIC_ID, clientHash: "h1" })).map((k) => k.key)).toEqual(["query|c|h1"]);
    expect(rateKeys(ok("query", { publicId: PUBLIC_ID }))).toEqual([]);
  });

  it("are tighter for the irreversible step than for reading progress", () => {
    const fin = RATE_RULES.finalize.find((r) => r.by === "subject")!;
    const prog = RATE_RULES.progress.find((r) => r.by === "subject")!;
    expect(fin.limit).toBeLessThan(prog.limit);
  });
});

describe("requiresEnabledTool", () => {
  it("is true for what creates or changes a submission, false for what only reads or erases", () => {
    expect(requiresEnabledTool("start")).toBe(true);
    expect(requiresEnabledTool("reserve-answer")).toBe(true);
    expect(requiresEnabledTool("finalize")).toBe(true);
    expect(requiresEnabledTool("query")).toBe(false);
    expect(requiresEnabledTool("progress")).toBe(false);
    expect(requiresEnabledTool("forget-subject")).toBe(false);
    expect(requiresEnabledTool("hub")).toBe(false);
  });
});

describe("a query's outcome", () => {
  const base = { public_id: PUBLIC_ID, public_title: "T", state: "open" };
  const outcome = { kind: "story", title: "What we found", url: "https://example.org/s", published_at: "2026-10-23", summary: null, response_count: 41 };

  it("is null when the query has none, so no count leaves the Portal", () => {
    expect(shapeQuery(base)?.outcome).toBeNull();
    expect(shapeQuery({ ...base, outcome: null })?.outcome).toBeNull();
  });

  it("carries the newest outcome and the number who answered", () => {
    expect(shapeQuery({ ...base, outcome })?.outcome).toEqual({ kind: "story", title: "What we found", url: "https://example.org/s", publishedAt: "2026-10-23", summary: null, responseCount: 41 });
  });

  it("drops an outcome whose link is not https or whose kind is unknown", () => {
    expect(shapeQuery({ ...base, outcome: { ...outcome, url: "http://example.org" } })?.outcome).toBeNull();
    expect(shapeQuery({ ...base, outcome: { ...outcome, kind: "ad" } })?.outcome).toBeNull();
  });
});

describe("the hub", () => {
  const open = { public_id: PUBLIC_ID, public_title: "After the storm", public_intro: "Tell us.", asked_by: null, from_label: "from the news desk", context_label: null, closes_at: null, allow_text_answers: true, question_count: 3 };
  const outcome = { kind: "story", title: "What the storm left", url: "https://example.org/a", published_at: "2026-11-01", summary: null };

  it("takes no subject and calls its function with no arguments", () => {
    expect(ok("hub", {}).rpc).toEqual({ fn: "al_site_hub", args: {} });
    expect(ok("hub", {}).subjectKey).toBeNull();
    expect(parseListeningRequest("hub", "nope")).toEqual({ ok: false, error: "invalid_request" });
  });

  it("is rate limited by the client address only", () => {
    expect(RATE_RULES.hub.every((rule) => rule.by === "client")).toBe(true);
    expect(rateKeys(ok("hub", { clientHash: "abc" }))).toHaveLength(1);
    expect(rateKeys(ok("hub", {}))).toHaveLength(0);
  });

  it("shapes open questions without any count of responses", () => {
    const { open: shaped } = shapeHub({ open: [open], answered: [] });
    expect(shaped).toEqual([
      { publicId: PUBLIC_ID, title: "After the storm", intro: "Tell us.", askedBy: null, fromLabel: "from the news desk", contextLabel: null, closesAt: null, allowTextAnswers: true, questionCount: 3, campaignPublicId: null },
    ]);
    expect(Object.keys(shaped[0] ?? {})).not.toContain("responseCount");
  });

  it("gives a count only to an answered question, and only with its outcomes", () => {
    const { answered } = shapeHub({ open: [], answered: [{ public_id: PUBLIC_ID, public_title: "T", response_count: 41, outcomes: [outcome] }] });
    expect(answered).toHaveLength(1);
    expect(answered[0]?.responseCount).toBe(41);
    expect(answered[0]?.outcomes[0]).toEqual({ kind: "story", title: "What the storm left", url: "https://example.org/a", publishedAt: "2026-11-01", summary: null });
  });

  it("drops an answered question whose outcomes are not usable, and any link that is not https", () => {
    const bad = [{ ...outcome, url: "http://example.org/a" }, { ...outcome, url: "javascript:alert(1)" }, { ...outcome, kind: "ad" }, { ...outcome, url: "https://user:pw@example.org/" }];
    expect(shapeHub({ open: [], answered: [{ public_id: PUBLIC_ID, public_title: "T", response_count: 3, outcomes: bad }] }).answered).toEqual([]);
  });

  it("is empty, not an error, for a payload it cannot read", () => {
    expect(shapeHub(null)).toEqual({ open: [], answered: [], events: [], kitchenCampaigns: [], campaigns: [] });
    expect(shapeResponse("hub", { error: "nope" }).ok).toBe(false);
    expect(shapeResponse("hub", { open: [], answered: [] })).toEqual({ ok: true, body: { hub: { open: [], answered: [], events: [], kitchenCampaigns: [], campaigns: [] } } });
  });

  it("lists upcoming public events, and drops one that is missing what the page needs", () => {
    const event = { public_id: PUBLIC_ID, title: "Listening session", starts_at: "2026-11-15T16:00:00Z", ends_at: "2026-11-15T19:00:00Z", place_name: "Milton Community Center", city: "Milton", organizer_label: null, seats_left: 12 };
    const { events } = shapeHub({ open: [], answered: [], events: [event, { ...event, place_name: null }, { ...event, public_id: undefined }, "nope"] });
    expect(events).toEqual([
      { publicId: PUBLIC_ID, title: "Listening session", startsAt: "2026-11-15T16:00:00Z", endsAt: "2026-11-15T19:00:00Z", placeName: "Milton Community Center", city: "Milton", organizerLabel: null, seatsLeft: 12, campaignPublicId: null },
    ]);
  });

  it("lists the campaigns that accept a kitchen table, and drops one that is missing a title or question", () => {
    const { kitchenCampaigns } = shapeHub({
      open: [],
      answered: [],
      kitchen_campaigns: [
        { public_id: PUBLIC_ID, title: "Season", question: "What would make it easier to stay?" },
        { public_id: PUBLIC_ID, title: "No question" },
        "nope",
      ],
    });
    expect(kitchenCampaigns).toEqual([{ publicId: PUBLIC_ID, title: "Season", question: "What would make it easier to stay?" }]);
  });

  it("says which campaign a question and a session belong to, and frames the open campaigns", () => {
    const CAMPAIGN = "campaign00000001";
    const hub = shapeHub({
      open: [{ ...open, campaign_public_id: CAMPAIGN }],
      answered: [],
      events: [{ public_id: PUBLIC_ID, title: "Session", starts_at: "2026-11-15T16:00:00Z", ends_at: "2026-11-15T19:00:00Z", place_name: "Library", city: null, organizer_label: null, seats_left: null, campaign_public_id: CAMPAIGN }],
      campaigns: [
        { public_id: CAMPAIGN, title: "Season", question: "What would make it easier to stay?", intro: "A few times a year.", owner_label: "from WUWF", closes_at: "2026-12-20T00:00:00Z" },
        { public_id: CAMPAIGN, title: "No question" },
        "nope",
      ],
    });
    expect(hub.open[0]?.campaignPublicId).toBe(CAMPAIGN);
    expect(hub.events?.[0]?.campaignPublicId).toBe(CAMPAIGN);
    expect(hub.campaigns).toEqual([{ publicId: CAMPAIGN, title: "Season", question: "What would make it easier to stay?", intro: "A few times a year.", ownerLabel: "from WUWF", closesAt: "2026-12-20T00:00:00Z" }]);
  });

  it("gives no events, and no error, when the database sends none", () => {
    expect(shapeHub({ open: [], answered: [] }).events).toEqual([]);
  });
});

describe("inbox-send and host-request (phase C)", () => {
  const SUBJ = { kind: "visitor", id: "v_abc-123" } as const;
  const HOST = {
    subject: SUBJ,
    name: " Mary Jones ",
    email: "mary@example.org",
    kind: "invite",
    organization: "",
    seats: 12,
    address: " 12 Palafox Place ",
    expected: "9-12",
    whenText: "A Saturday in March",
    inviteesText: null,
    journalistRequested: true,
  };

  it("inbox-send trims the message, keeps an optional email, and calls the one function", () => {
    const r = parseListeningRequest("inbox-send", { subject: SUBJ, kind: "story_idea", body: "  Who fixes the bridge?  ", email: "a@b.co" });
    expect(r.ok && r.request.rpc).toEqual({
      fn: "al_site_inbox_send",
      args: { p_subject: "site:visitor:v_abc-123", p_kind: "story_idea", p_body: "Who fixes the bridge?", p_email: "a@b.co" },
    });
    const none = parseListeningRequest("inbox-send", { subject: SUBJ, kind: "question", body: "Why?", email: "  " });
    expect(none.ok && none.request.rpc.args["p_email"]).toBeNull();
    const absent = parseListeningRequest("inbox-send", { subject: SUBJ, kind: "question", body: "Why?" });
    expect(absent.ok && absent.request.rpc.args["p_email"]).toBeNull();
  });

  it("inbox-send refuses a missing subject, an unknown kind, an empty or over-long body, and a bad email", () => {
    const base = { subject: SUBJ, kind: "question", body: "Why?" };
    expect(parseListeningRequest("inbox-send", { kind: "question", body: "Why?" }).ok).toBe(false);
    expect(parseListeningRequest("inbox-send", { ...base, kind: "complaint" }).ok).toBe(false);
    expect(parseListeningRequest("inbox-send", { ...base, body: "   " }).ok).toBe(false);
    expect(parseListeningRequest("inbox-send", { ...base, body: "x".repeat(2001) }).ok).toBe(false);
    expect(parseListeningRequest("inbox-send", { ...base, body: "x".repeat(2000) }).ok).toBe(true);
    expect(parseListeningRequest("inbox-send", { ...base, email: "not an email" }).ok).toBe(false);
    expect(parseListeningRequest("inbox-send", { ...base, email: 5 }).ok).toBe(false);
  });

  it("host-request maps every field, trims, and turns blank optionals into null", () => {
    const r = parseListeningRequest("host-request", HOST);
    expect(r.ok && r.request.rpc).toEqual({
      fn: "al_site_host_request",
      args: {
        p_subject: "site:visitor:v_abc-123",
        p_name: "Mary Jones",
        p_email: "mary@example.org",
        p_kind: "invite",
        p_organization: null,
        p_seats: 12,
        p_address: "12 Palafox Place",
        p_expected: "9-12",
        p_when_text: "A Saturday in March",
        p_invitees_text: null,
        p_journalist_requested: true,
      },
    });
  });

  it("host-request refuses what the form could not have sent", () => {
    for (const bad of [
      { ...HOST, name: " " },
      { ...HOST, email: "" },
      { ...HOST, email: "nope" },
      { ...HOST, kind: "private" },
      { ...HOST, seats: 20 },
      { ...HOST, seats: "12" },
      { ...HOST, expected: "13+" },
      { ...HOST, address: "" },
      { ...HOST, whenText: "x".repeat(501) },
      { ...HOST, inviteesText: "x".repeat(2001) },
      { ...HOST, journalistRequested: "yes" },
      { ...HOST, subject: undefined },
    ]) {
      expect(parseListeningRequest("host-request", bad).ok).toBe(false);
    }
  });

  it("answers an empty success, and has a tighter hourly limit than the answer flow", () => {
    expect(shapeResponse("inbox-send", { ok: true })).toEqual({ ok: true, body: {} });
    expect(shapeResponse("host-request", { ok: true })).toEqual({ ok: true, body: {} });
    expect(shapeResponse("host-request", null)).toEqual({ ok: false, error: "unavailable" });
    expect(shapeResponse("inbox-send", { error: "not_accepting" })).toEqual({ ok: false, error: "not_accepting" });
    expect(shapeResponse("host-request", { error: "required_field_missing" })).toEqual({ ok: false, error: "required_field_missing" });
    const rules = (a: "inbox-send" | "host-request") => RATE_RULES[a].map((r) => `${r.by}:${r.limit}/${r.windowSeconds}`);
    expect(rules("inbox-send")).toEqual(["subject:5/3600", "client:30/3600"]);
    expect(rules("host-request")).toEqual(["subject:3/3600", "client:15/3600"]);
  });

  it("both need the tool switched on", () => {
    expect(requiresEnabledTool("inbox-send")).toBe(true);
    expect(requiresEnabledTool("host-request")).toBe(true);
  });
});
