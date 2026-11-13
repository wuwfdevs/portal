import { describe, expect, it } from "vitest";
import { LISTENING_TABLE_SESSION_LENGTH, LISTENING_TABLE_TOKEN_LENGTH } from "@wuwf/portal-contracts";
import { parseListeningRequest, rateKeys, shapeConversation, shapeResponse, shapeRoom, shapeTable } from "./site-api-shapes";
import { hashJoinToken } from "./table-links";

const SESSION = "S".repeat(LISTENING_TABLE_SESSION_LENGTH);
const CARD = "C".repeat(LISTENING_TABLE_TOKEN_LENGTH);
const SPEAKER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const EVENT = "abcdefghijkmnpqs";
const ACCOUNT = { kind: "account", id: "org1" } as const;
const VISITOR = { kind: "visitor", id: "v1" } as const;

function ok(action: Parameters<typeof parseListeningRequest>[0], body: unknown) {
  const r = parseListeningRequest(action, body);
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.request;
}
function bad(action: Parameters<typeof parseListeningRequest>[0], body: unknown) {
  expect(parseListeningRequest(action, body).ok).toBe(false);
}

describe("after-page messages", () => {
  it("authorise by the table session and send only its hash", () => {
    for (const action of ["conversation", "conversation-send"] as const) {
      const call = ok(action, { session: SESSION });
      expect(call.rpc.args).toEqual({ p_session_hash: hashJoinToken(SESSION) });
      bad(action, {});
    }
  });

  it("saves speakers as a whole set with at most the fields the Portal reads", () => {
    const call = ok("speakers-save", {
      session: SESSION,
      speakers: [
        { id: SPEAKER, name: " Dana ", isFacilitator: true, mergedInto: null },
        { id: OTHER, name: null, isFacilitator: false, mergedInto: SPEAKER, extra: "dropped" },
      ],
    });
    expect(call.rpc.args["p_speakers"]).toEqual([
      { id: SPEAKER, name: "Dana", isFacilitator: true, mergedInto: null },
      { id: OTHER, name: null, isFacilitator: false, mergedInto: SPEAKER },
    ]);
    bad("speakers-save", { session: SESSION, speakers: [{ id: "nope", name: null, isFacilitator: false, mergedInto: null }] });
    bad("speakers-save", { session: SESSION, speakers: [{ id: SPEAKER, name: "x".repeat(61), isFacilitator: false, mergedInto: null }] });
    bad("speakers-save", { session: SESSION, speakers: [{ id: SPEAKER, name: null, isFacilitator: "yes", mergedInto: null }] });
    bad("speakers-save", { session: SESSION, speakers: [{ id: SPEAKER, name: null, isFacilitator: false, mergedInto: "bad" }] });
    bad("speakers-save", { session: SESSION, speakers: "all" });
  });

  it("saves highlights by where a line starts and never by its words", () => {
    const call = ok("highlights-save", { session: SESSION, highlights: [{ startMs: 4000, tag: " Cost ", text: "ignored" }, { startMs: 0, tag: null }] });
    expect(call.rpc.args["p_highlights"]).toEqual([{ startMs: 4000, tag: "Cost" }, { startMs: 0, tag: null }]);
    expect(JSON.stringify(call.rpc.args)).not.toContain("ignored");
    bad("highlights-save", { session: SESSION, highlights: [{ startMs: -1, tag: null }] });
    bad("highlights-save", { session: SESSION, highlights: [{ startMs: 1.5, tag: null }] });
    bad("highlights-save", { session: SESSION, highlights: Array.from({ length: 101 }, (_, i) => ({ startMs: i, tag: null })) });
  });
});

describe("contact cards", () => {
  it("open by the table's second token, with no subject", () => {
    const call = ok("contact-card-open", { cardToken: CARD });
    expect(call.subjectKey).toBeNull();
    expect(call.rpc.args).toEqual({ p_card_hash: hashJoinToken(CARD) });
    bad("contact-card-open", { cardToken: "short" });
  });

  it("are saved per subject, with three separate choices and no hidden defaults", () => {
    const body = { cardToken: CARD, subject: VISITOR, firstName: " Sam ", contact: "sam@x.org", mayContact: true, mayName: false, keepAnonymous: true };
    const call = ok("contact-card-save", body);
    expect(call.rpc.args).toMatchObject({ p_subject: "site:visitor:v1", p_first_name: "Sam", p_contact: "sam@x.org", p_may_contact: true, p_may_name: false, p_keep_anonymous: true });
    expect(ok("contact-card-save", { ...body, contact: "  " }).rpc.args["p_contact"]).toBeNull();
    // Saying yes to contact without a way to be reached is accepted: the page warns, the Portal does not block.
    expect(ok("contact-card-save", { ...body, contact: null }).rpc.args["p_contact"]).toBeNull();
  });

  it("refuse naming and anonymity together, a missing choice, a blank name or no subject", () => {
    const body = { cardToken: CARD, subject: VISITOR, firstName: "Sam", contact: null, mayContact: false, mayName: true, keepAnonymous: false };
    bad("contact-card-save", { ...body, keepAnonymous: true });
    bad("contact-card-save", { ...body, mayContact: undefined });
    bad("contact-card-save", { ...body, firstName: " " });
    bad("contact-card-save", { ...body, subject: undefined });
  });

  it("have a tighter limit than the table's own calls", () => {
    const call = ok("contact-card-save", { cardToken: CARD, subject: VISITOR, firstName: "Sam", contact: null, mayContact: false, mayName: false, keepAnonymous: false });
    expect(rateKeys(call).length).toBeGreaterThan(0);
  });
});

describe("the organizer's room", () => {
  it("needs an account subject and an event's public id", () => {
    const call = ok("room", { subject: ACCOUNT, eventPublicId: EVENT });
    expect(call.rpc).toEqual({ fn: "al_site_room", args: { p_subject: "site:account:org1", p_public_id: EVENT } });
    bad("room", { subject: VISITOR, eventPublicId: EVENT });
    bad("room", { subject: ACCOUNT, eventPublicId: "nope" });
    bad("room", { eventPublicId: EVENT });
  });

  it("calls last call, a prompt or a cleared request, with a value only where one is needed", () => {
    expect(ok("room-call", { subject: ACCOUNT, eventPublicId: EVENT, action: "last-call" }).rpc.args["p_value"]).toBeNull();
    expect(ok("room-call", { subject: ACCOUNT, eventPublicId: EVENT, action: "prompt", value: 2 }).rpc.args).toMatchObject({ p_action: "prompt", p_value: 2 });
    expect(ok("room-call", { subject: ACCOUNT, eventPublicId: EVENT, action: "help-clear", value: 7 }).rpc.args["p_value"]).toBe(7);
    bad("room-call", { subject: ACCOUNT, eventPublicId: EVENT, action: "prompt" });
    bad("room-call", { subject: ACCOUNT, eventPublicId: EVENT, action: "end-event" });
    bad("room-call", { subject: VISITOR, eventPublicId: EVENT, action: "last-call" });
  });
});

describe("shaping", () => {
  const PAYLOAD = {
    status: "ready",
    transcript_ready: true,
    tags: ["Cost", 3],
    lines: [
      { start_ms: 0, end_ms: 4000, text: "Rent went up.", speaker_id: SPEAKER },
      { start_ms: "x", end_ms: 1, text: "dropped" },
    ],
    speakers: [{ id: SPEAKER, label: "Voice 1", name: null, is_facilitator: false, first_heard_ms: 0, share_percent: 78, merged_into: null }, { label: "no id" }],
    highlights: [{ start_ms: 0, end_ms: 4000, text: "Rent went up.", tag: "Cost", speaker_id: SPEAKER }],
    contact_card_count: 2,
  };

  it("maps the after-page and drops what it cannot read", () => {
    const c = shapeConversation(PAYLOAD)!;
    expect(c).toMatchObject({ status: "ready", transcriptReady: true, tags: ["Cost"], contactCardCount: 2 });
    expect(c.lines).toEqual([{ startMs: 0, endMs: 4000, text: "Rent went up.", speakerId: SPEAKER }]);
    expect(c.speakers).toHaveLength(1);
    expect(shapeConversation({ ...PAYLOAD, status: "gone" })).toBeNull();
    expect(shapeResponse("conversation", { error: "not_found" })).toEqual({ ok: false, error: "not_found" });
  });

  it("gives the facilitator a count of cards and none of their contents", () => {
    const json = JSON.stringify(shapeConversation({ ...PAYLOAD, contact_cards: [{ contact: "sam@x.org" }] }));
    expect(json).not.toContain("sam@x.org");
    expect(json).toContain("contactCardCount");
  });

  it("maps the room to states only", () => {
    const room = shapeRoom({
      title: "Night", status: "live", starts_at: "a", ends_at: "b", current_prompt_position: 2, last_call_at: null,
      prompts: [{ position: 1, kind: "question", text: "Q", suggested_seconds: null }, { position: 2, kind: "bogus", text: "x" }],
      tables: [{ number: 1, state: "recording", prompt_position: 1, help_requested: true, facilitator_first_name: "Dana", transcript: "never" }, { number: 2, state: "gone" }],
    })!;
    expect(room.tables).toEqual([{ number: 1, state: "recording", promptPosition: 1, helpRequested: true, facilitatorFirstName: "Dana" }]);
    expect(room.prompts).toHaveLength(1);
    expect(JSON.stringify(room)).not.toContain("never");
    expect(shapeResponse("room", { room: null })).toEqual({ ok: false, error: "unavailable" });
  });

  it("tells a phone whether help is watched for and where the room is", () => {
    const table = shapeTable({ number: 1, state: "recording", consent: null, prompts: [], tags: [], uploaded_seqs: [], event_prompt_position: 3, last_call_at: "2026-12-05T20:00:00Z", help_available: true })!;
    expect(table).toMatchObject({ eventPromptPosition: 3, lastCallAt: "2026-12-05T20:00:00Z", helpAvailable: true });
    expect(shapeTable({ number: 1, state: "recording" })!.helpAvailable).toBe(false);
  });
});
