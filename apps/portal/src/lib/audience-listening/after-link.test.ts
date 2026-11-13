import { describe, expect, it } from "vitest";
import { AFTER_LINK_DAYS, AFTER_LINK_LIMIT_DAYS, afterLinkExpiry, afterLinkStatus, issueAfterLink, issueOrganizerLink, needsAfterLink } from "./after-link";
import { hashJoinToken } from "./table-links";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-16T14:00:00Z");

describe("afterLinkExpiry", () => {
  it("is fourteen days from now", () => {
    expect(afterLinkExpiry(new Date("2026-11-15T19:00:00Z"), NOW)?.getTime()).toBe(NOW.getTime() + AFTER_LINK_DAYS * DAY);
  });
  it("never reaches past thirty days after the event, where the purge removes the conversation", () => {
    const ended = new Date(NOW.getTime() - 25 * DAY);
    expect(afterLinkExpiry(ended, NOW)?.getTime()).toBe(ended.getTime() + AFTER_LINK_LIMIT_DAYS * DAY);
  });
  it("is null once that day has passed", () => {
    expect(afterLinkExpiry(new Date(NOW.getTime() - 31 * DAY), NOW)).toBeNull();
  });
});

describe("issueAfterLink", () => {
  it("makes a 43-character token, stores only its hash, and puts the token in the after-page address", () => {
    const link = issueAfterLink("https://site.example", new Date("2026-11-15T19:00:00Z"), NOW)!;
    expect(link.token).toHaveLength(43);
    expect(link.hash).toBe(hashJoinToken(link.token));
    expect(link.url).toBe(`https://site.example/listens/after/${link.token}`);
    expect(link.hash).not.toContain(link.token);
  });
  it("makes a different token each time", () => {
    const a = issueAfterLink("https://site.example", new Date("2026-11-15T19:00:00Z"), NOW)!;
    const b = issueAfterLink("https://site.example", new Date("2026-11-15T19:00:00Z"), NOW)!;
    expect(a.token).not.toBe(b.token);
  });
  it("makes none for an event whose thirty days are over", () => {
    expect(issueAfterLink("https://site.example", new Date(NOW.getTime() - 40 * DAY), NOW)).toBeNull();
  });
});

describe("issueOrganizerLink", () => {
  it("puts the token in the organizer claim address and keeps only its hash", () => {
    const link = issueOrganizerLink("https://site.example/");
    expect(link.url).toBe(`https://site.example/listens/room/claim/${link.token}`);
    expect(link.hash).toBe(hashJoinToken(link.token));
  });
});

describe("afterLinkStatus", () => {
  const withEmail = { facilitator_email: "dana@example.org", after_link_sent_at: null };
  it("needs an email first", () => {
    expect(afterLinkStatus({ facilitator_email: null, after_link_sent_at: null }, { status: "ready" })).toBe("no_email");
  });
  it("needs something recorded", () => {
    expect(afterLinkStatus(withEmail, null)).toBe("no_conversation");
  });
  it("has nothing left to do once the facilitator has sent the conversation", () => {
    expect(afterLinkStatus(withEmail, { status: "sent" })).toBe("conversation_sent");
  });
  it("tells a link not yet sent from one that was", () => {
    expect(afterLinkStatus(withEmail, { status: "ready" })).toBe("not_sent");
    expect(afterLinkStatus({ ...withEmail, after_link_sent_at: "2026-11-16T12:00:00Z" }, { status: "ready" })).toBe("sent");
  });
  it("selects, for the bulk send, only a table that has an email, a conversation not sent, and no link yet", () => {
    expect(needsAfterLink(withEmail, { status: "ready" })).toBe(true);
    expect(needsAfterLink({ ...withEmail, after_link_sent_at: "2026-11-16T12:00:00Z" }, { status: "ready" })).toBe(false);
    expect(needsAfterLink(withEmail, { status: "sent" })).toBe(false);
    expect(needsAfterLink({ facilitator_email: null, after_link_sent_at: null }, { status: "ready" })).toBe(false);
  });
});
