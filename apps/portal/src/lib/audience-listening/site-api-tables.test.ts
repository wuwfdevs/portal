import { describe, expect, it } from "vitest";
import { LISTENING_TABLE_SESSION_LENGTH, LISTENING_TABLE_TOKEN_LENGTH } from "@wuwf/portal-contracts";
import { RATE_RULES, parseListeningRequest, rateKeys, requiresEnabledTool, shapeEvent, shapeResponse, shapeTable, statusForError } from "./site-api-shapes";
import { generateJoinToken, hashJoinToken } from "./table-links";

const LINK = "L".repeat(LISTENING_TABLE_TOKEN_LENGTH);
const SESSION = "S".repeat(LISTENING_TABLE_SESSION_LENGTH);
const SESSION_HASH = hashJoinToken(SESSION);

function ok(action: Parameters<typeof parseListeningRequest>[0], body: unknown) {
  const r = parseListeningRequest(action, body);
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.request;
}
function bad(action: Parameters<typeof parseListeningRequest>[0], body: unknown) {
  const r = parseListeningRequest(action, body);
  expect(r.ok).toBe(false);
}

describe("table messages: authorisation", () => {
  it("send only a hash of the link or session to the database, never the token", () => {
    const open = ok("table-open", { linkToken: LINK });
    expect(open.rpc.fn).toBe("al_site_table_open");
    expect(open.rpc.args.p_link_hash).toBe(hashJoinToken(LINK));
    expect(JSON.stringify(open.rpc.args)).not.toContain(LINK);
    // The route makes the session; the parser leaves it empty.
    expect(open.rpc.args.p_session_hash).toBeNull();

    const state = ok("table-state", { session: SESSION });
    expect(state.rpc.args).toEqual({ p_session_hash: SESSION_HASH });
    expect(JSON.stringify(state.rpc.args)).not.toContain(SESSION);
  });

  it("refuse a missing, short, long or oddly-shaped token", () => {
    bad("table-open", {});
    bad("table-open", { linkToken: "short" });
    bad("table-open", { linkToken: `${LINK.slice(1)}/` });
    bad("table-state", { session: "x" });
    bad("table-state", { session: `${SESSION}x` });
    bad("table-state", { subject: { kind: "visitor", id: "v1" } });
  });

  it("do not need a subject, and a subject in the body is ignored", () => {
    const call = ok("table-state", { session: SESSION, subject: { kind: "visitor", id: "v1" } });
    expect(call.subjectKey).toBe(`table:${SESSION_HASH.slice(0, 24)}`);
  });

  it("count the rate limit on the session, so one phone cannot spend another's", () => {
    const a = ok("table-update", { session: SESSION, event: "pause" });
    const b = ok("table-update", { session: "T".repeat(43), event: "pause" });
    expect(rateKeys(a)[0]!.key).not.toBe(rateKeys(b)[0]!.key);
  });
});

describe("table messages: bodies", () => {
  it("agree carries the version shown and an optional first name", () => {
    const call = ok("table-agree", { session: SESSION, consentVersion: 2, firstName: "  Dana " });
    expect(call.rpc.args).toMatchObject({ p_consent_version: 2, p_first_name: "Dana" });
    expect(ok("table-agree", { session: SESSION, consentVersion: 2, firstName: null }).rpc.args.p_first_name).toBeNull();
    bad("table-agree", { session: SESSION, firstName: "Dana" });
    bad("table-agree", { session: SESSION, consentVersion: 0 });
    bad("table-agree", { session: SESSION, consentVersion: 1, firstName: "x".repeat(61) });
  });

  it("update takes only known events, and a prompt needs its position", () => {
    expect(ok("table-update", { session: SESSION, event: "start" }).rpc.args).toMatchObject({ p_event: "start", p_prompt: null });
    expect(ok("table-update", { session: SESSION, event: "prompt", promptPosition: 3 }).rpc.args.p_prompt).toBe(3);
    bad("table-update", { session: SESSION, event: "prompt" });
    bad("table-update", { session: SESSION, event: "delete" });
  });

  it("segments are numbered within range and keep to the types the bucket takes", () => {
    const call = ok("table-segment", { session: SESSION, seq: 0, contentType: "audio/webm;codecs=opus" });
    expect(call.contentType).toBe("audio/webm");
    expect(call.rpc.args).toMatchObject({ p_seq: 0, p_content_type: "audio/webm" });
    bad("table-segment", { session: SESSION, seq: 100, contentType: "audio/webm" });
    bad("table-segment", { session: SESSION, seq: -1, contentType: "audio/webm" });
    bad("table-segment", { session: SESSION, seq: 1.5, contentType: "audio/webm" });
    bad("table-segment", { session: SESSION, seq: 1, contentType: "video/mp4" });
  });

  it("completing a segment needs whole numbers within the caps", () => {
    expect(ok("table-segment-complete", { session: SESSION, seq: 2, sizeBytes: 1000, durationMs: 299000 }).rpc.args).toMatchObject({ p_seq: 2, p_size_bytes: 1000 });
    bad("table-segment-complete", { session: SESSION, seq: 2, sizeBytes: 0, durationMs: 1 });
    bad("table-segment-complete", { session: SESSION, seq: 2, sizeBytes: 60 * 1024 * 1024, durationMs: 1 });
    bad("table-segment-complete", { session: SESSION, seq: 2, sizeBytes: 5, durationMs: "1" });
  });

  it("ending allows -1 for nothing recorded", () => {
    expect(ok("table-end", { session: SESSION, lastSeq: -1 }).rpc.args.p_last_seq).toBe(-1);
    expect(ok("table-end", { session: SESSION, lastSeq: 12 }).rpc.args.p_last_seq).toBe(12);
    bad("table-end", { session: SESSION, lastSeq: -2 });
    bad("table-end", { session: SESSION });
  });
});

describe("event and seat-save", () => {
  it("read an event by public id with no subject", () => {
    const call = ok("event", { publicId: "abcdefghijkmnpqs" });
    expect(call.subjectKey).toBeNull();
    expect(call.rpc).toEqual({ fn: "al_site_event", args: { p_public_id: "abcdefghijkmnpqs" } });
    bad("event", { publicId: "nope" });
  });

  it("save a seat for a subject with a name and a real-looking email", () => {
    const call = ok("seat-save", { subject: { kind: "visitor", id: "v1" }, publicId: "abcdefghijkmnpqs", name: " Dana ", email: "d@x.org" });
    expect(call.rpc.args).toMatchObject({ p_subject: "site:visitor:v1", p_name: "Dana", p_email: "d@x.org" });
    bad("seat-save", { subject: { kind: "visitor", id: "v1" }, publicId: "abcdefghijkmnpqs", name: "Dana", email: "nope" });
    bad("seat-save", { subject: { kind: "visitor", id: "v1" }, publicId: "abcdefghijkmnpqs", name: " ", email: "d@x.org" });
  });
});

const TABLE = {
  number: 3,
  state: "agreed",
  event_title: "Night",
  place_name: "Library",
  question: "How?",
  prompt_position: 2,
  help_requested: false,
  facilitator_first_name: "Dana",
  consent: { version: 2, text: "Read this." },
  prompts: [
    { position: 1, kind: "question", text: "Tell us.", hint: null, suggested_seconds: 120 },
    { position: 2, kind: "bogus", text: "dropped" },
  ],
  tags: ["Cost", 5],
  uploaded_seqs: [0, 1],
};

describe("shaping a table", () => {
  it("maps the view onto the contract and drops a prompt it cannot read", () => {
    const table = shapeTable(TABLE)!;
    expect(table).toMatchObject({ number: 3, state: "agreed", consent: { version: 2, text: "Read this." }, uploadedSeqs: [0, 1], tags: ["Cost"] });
    expect(table.prompts).toEqual([{ position: 1, kind: "question", text: "Tell us.", hint: null, suggestedSeconds: 120 }]);
  });
  it("has no consent when there is none to read, and is null for what is not a table", () => {
    expect(shapeTable({ ...TABLE, consent: null })!.consent).toBeNull();
    expect(shapeTable(null)).toBeNull();
    expect(shapeTable({ ...TABLE, state: "gone" })).toBeNull();
  });
  it("never carries a hash or a token it was not given", () => {
    const json = JSON.stringify(shapeTable({ ...TABLE, session_hash: "x", join_token_hash: "y" }));
    expect(json).not.toContain("session_hash");
    expect(json).not.toContain("join_token");
  });
});

describe("shaping responses", () => {
  it("opens with the table and when the session ends, leaving the token to the route", () => {
    const shaped = shapeResponse("table-open", { table: TABLE, session_expires_at: "2026-12-06T12:00:00Z" });
    expect(shaped).toMatchObject({ ok: true, body: { sessionExpiresAt: "2026-12-06T12:00:00Z" } });
    expect(shapeResponse("table-open", { table: TABLE })).toEqual({ ok: false, error: "unavailable" });
  });
  it("passes the new refusals through, and a used link is a rule refusal", () => {
    expect(shapeResponse("table-open", { error: "link_used" })).toEqual({ ok: false, error: "link_used" });
    expect(shapeResponse("seat-save", { error: "event_full" })).toEqual({ ok: false, error: "event_full" });
    expect(statusForError("link_used")).toBe(422);
    expect(statusForError("event_full")).toBe(422);
  });
  it("tells a segment already uploaded from one to upload", () => {
    expect(shapeResponse("table-segment", { seq: 0, already_uploaded: true })).toEqual({ ok: true, body: { seq: 0, alreadyUploaded: true } });
    expect(shapeResponse("table-segment", { seq: 1, storage_path: "e/t/1", max_segment_seconds: 300 })).toEqual({
      ok: true,
      body: { seq: 1, storagePath: "e/t/1", maxSegmentSeconds: 300 },
    });
  });
  it("reports what is still missing when a table ends", () => {
    expect(shapeResponse("table-end", { complete: false, missing: [2, "x", 4] })).toEqual({ ok: true, body: { complete: false, missing: [2, 4] } });
    expect(shapeResponse("table-end", {})).toEqual({ ok: false, error: "unavailable" });
  });
  it("answers an event that is not listed as not_available", () => {
    expect(shapeResponse("event", null)).toEqual({ ok: false, error: "not_available" });
    expect(shapeEvent({ public_id: "abcdefghijkmnpqs", title: "T", starts_at: "a", ends_at: "b", place_name: "P", seats_left: 4 })).toMatchObject({ seatsLeft: 4, address: null });
  });
});

describe("limits", () => {
  it("define a rule for every new action, and require the tool to be on for all of them", () => {
    for (const action of ["event", "seat-save", "table-open", "table-state", "table-agree", "table-update", "table-segment", "table-segment-complete", "table-end"] as const) {
      expect(RATE_RULES[action].length).toBeGreaterThan(0);
      expect(requiresEnabledTool(action)).toBe(true);
    }
  });
  it("mints a different session every time", () => {
    expect(generateJoinToken()).not.toBe(generateJoinToken());
  });
});
