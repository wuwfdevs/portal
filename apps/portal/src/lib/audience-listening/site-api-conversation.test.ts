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

describe("a kitchen table", () => {
  const CAMPAIGN = "abcdefghijkmnpqs";

  it("is started by a visitor or an account, and only the link's hash reaches the database", () => {
    const call = ok("kitchen-table-create", { subject: VISITOR, campaignPublicId: CAMPAIGN, hostName: " Dana ", place: "My kitchen", startsAt: "2026-11-20T23:00:00Z" });
    expect(call.rpc.fn).toBe("al_site_kitchen_table_create");
    // The route makes the token and puts its hash here; the parser leaves it empty.
    expect(call.rpc.args).toEqual({
      p_subject: "site:visitor:v1",
      p_campaign_public_id: CAMPAIGN,
      p_link_hash: null,
      p_host_name: "Dana",
      p_place: "My kitchen",
      p_starts_at: "2026-11-20T23:00:00.000Z",
    });
    expect(ok("kitchen-table-create", { subject: ACCOUNT, campaignPublicId: CAMPAIGN }).rpc.args["p_starts_at"]).toBeNull();
  });

  it("refuses a campaign id of the wrong shape, an over-long name or place, and a start that is not a time", () => {
    bad("kitchen-table-create", { subject: VISITOR, campaignPublicId: "nope" });
    bad("kitchen-table-create", { subject: VISITOR, campaignPublicId: CAMPAIGN, hostName: "x".repeat(121) });
    bad("kitchen-table-create", { subject: VISITOR, campaignPublicId: CAMPAIGN, place: "x".repeat(201) });
    bad("kitchen-table-create", { subject: VISITOR, campaignPublicId: CAMPAIGN, startsAt: "someday" });
    bad("kitchen-table-create", { campaignPublicId: CAMPAIGN });
  });

  it("is limited by host and by address, per day", () => {
    const keys = rateKeys({ ...ok("kitchen-table-create", { subject: VISITOR, campaignPublicId: CAMPAIGN }), clientHash: "h".repeat(8) });
    expect(keys.map((k) => k.rule.windowSeconds)).toEqual([86400, 86400]);
  });

  it("answers with the event's address and the campaign's wording, and says unavailable for anything else", () => {
    expect(shapeResponse("kitchen-table-create", { event_public_id: CAMPAIGN, title: "Season", question: "A question?" })).toEqual({
      ok: true,
      body: { eventPublicId: CAMPAIGN, title: "Season", question: "A question?" },
    });
    expect(shapeResponse("kitchen-table-create", null).ok).toBe(false);
    expect(shapeResponse("kitchen-table-create", { error: "rate_limited" })).toEqual({ ok: false, error: "rate_limited" });
  });
});

describe("an organizer's link", () => {
  const CLAIM = "C".repeat(LISTENING_TABLE_TOKEN_LENGTH);

  it("is redeemed by an account, and only its hash reaches the database", () => {
    const call = ok("room-claim", { subject: ACCOUNT, claimToken: CLAIM });
    expect(call.rpc).toEqual({ fn: "al_site_room_claim", args: { p_subject: "site:account:org1", p_claim_hash: hashJoinToken(CLAIM) } });
    expect(JSON.stringify(call.rpc.args)).not.toContain(CLAIM);
  });

  it("refuses a visitor, a missing or malformed token, and a token of the wrong length", () => {
    bad("room-claim", { subject: VISITOR, claimToken: CLAIM });
    bad("room-claim", { subject: ACCOUNT });
    bad("room-claim", { subject: ACCOUNT, claimToken: "short" });
    bad("room-claim", { subject: ACCOUNT, claimToken: `${"C".repeat(42)}/` });
  });

  it("is rate limited by account and by address", () => {
    expect(rateKeys({ ...ok("room-claim", { subject: ACCOUNT, claimToken: CLAIM }), clientHash: "h".repeat(8) }).length).toBe(2);
  });

  it("answers with the event's public id, and with unavailable when the database says nothing usable", () => {
    expect(shapeResponse("room-claim", { public_id: EVENT })).toEqual({ ok: true, body: { eventPublicId: EVENT } });
    expect(shapeResponse("room-claim", null).ok).toBe(false);
    expect(shapeResponse("room-claim", { error: "not_found" })).toEqual({ ok: false, error: "not_found" });
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
    proposals: [40000, 90000, -1, "x", 1.5],
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

  it("carries a suggested name only when there is one, and the starts of proposed lines without anything of the model's", () => {
    const withSuggestion = { ...PAYLOAD, speakers: [{ ...PAYLOAD.speakers[0], suggested_name: "Rosa" }] };
    const c = shapeConversation(withSuggestion)!;
    expect(c.speakers[0]?.suggestedName).toBe("Rosa");
    expect(shapeConversation(PAYLOAD)!.speakers[0]?.suggestedName).toBeNull();
    // Only whole, non-negative start times survive; nothing else about a proposal (its reason, its text) is sent.
    expect(c.proposals).toEqual([40000, 90000]);
    expect(shapeConversation({ ...PAYLOAD, proposals: undefined })!.proposals).toEqual([]);
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

  it("says when a table is a kitchen table, and reads anything else as an event's table", () => {
    expect(shapeTable({ number: 1, state: "waiting", kitchen: true })!.kitchen).toBe(true);
    expect(shapeTable({ number: 1, state: "waiting", kitchen: false })!.kitchen).toBe(false);
    expect(shapeTable({ number: 1, state: "waiting" })!.kitchen).toBe(false);
  });
});
