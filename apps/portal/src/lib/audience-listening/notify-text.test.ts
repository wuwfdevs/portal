import { describe, expect, it } from "vitest";
import { askDigestEmailText, digestHasNews, facilitatorLinkEmailText, hostRequestEmailText, parseNotifyAddress, purgeReminderEmailText, weeklyDue } from "./notify-text";

describe("host request notification", () => {
  it("reads one shared mailbox and refuses anything else", () => {
    expect(parseNotifyAddress(" engage@example.org ")).toBe("engage@example.org");
    expect(parseNotifyAddress(undefined)).toBeNull();
    expect(parseNotifyAddress("")).toBeNull();
    expect(parseNotifyAddress("a@example.org, b@example.org")).toBeNull();
    expect(parseNotifyAddress("not an address")).toBeNull();
  });
  it("says one is waiting and links to it, with nothing the visitor wrote", () => {
    const { subject, text } = hostRequestEmailText("https://portal.example/audience-listening/host-requests");
    expect(subject).toMatch(/waiting/);
    expect(text).toContain("https://portal.example/audience-listening/host-requests");
    expect(text).not.toMatch(/@/);
  });
});

describe("the facilitator's link email", () => {
  const input = { stationName: "the station", firstName: " Dana ", eventTitle: "Listening session", tableNumber: 4, url: "https://site.example/listens/after/abc", expiresOn: "November 30" };

  it("names the table, carries the link once and says what it opens and until when", () => {
    const { subject, text } = facilitatorLinkEmailText(input);
    expect(subject).toBe("Name the voices and mark what mattered at table 4");
    expect(text.match(/https:\/\/site\.example\/listens\/after\/abc/g)).toHaveLength(1);
    expect(text).toContain("Hello Dana,");
    expect(text).toContain("works until November 30");
    expect(text).toMatch(/do not forward it/);
  });
  it("greets a facilitator without a name plainly", () => {
    expect(facilitatorLinkEmailText({ ...input, firstName: null }).text.startsWith("Hello,\n")).toBe(true);
  });
  it("does not carry the transcript, the table's words or the facilitator's email", () => {
    const { text, subject } = facilitatorLinkEmailText(input);
    expect(`${subject}\n${text}`).not.toMatch(/@/);
  });
});

describe("scheduled emails", () => {
  it("the purge reminder carries counts and the address, not content", () => {
    const m = purgeReminderEmailText({ conversations: 2, submissions: 1 }, "https://tools.example.org/audience-listening/purge");
    expect(m.text).toContain("2 conversations that were never sent and 1 unfinished answer are past");
    expect(m.text).toContain("https://tools.example.org/audience-listening/purge");
    expect(purgeReminderEmailText({ conversations: 1, submissions: 0 }, "u").text).toContain("1 conversation that was never sent is past");
  });
  it("the digest names late requests and stays quiet when nothing waits", () => {
    const m = askDigestEmailText({ questions: 3, hostRequests: 2, hostRequestsLate: 1 }, { questions: "https://x/q", hostRequests: "https://x/h" });
    expect(m.subject).toContain("past five days");
    expect(m.text).toContain("3 new questions and ideas: https://x/q");
    expect(m.text).toContain("2 requests to host a listening session, 1 waiting more than five days: https://x/h");
    expect(digestHasNews({ questions: 0, hostRequests: 0 })).toBe(false);
    expect(digestHasNews({ questions: 0, hostRequests: 1 })).toBe(true);
  });
  it("a weekly reminder is due when never sent or six days old", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(weeklyDue(null, now)).toBe(true);
    expect(weeklyDue(new Date("2026-11-15T12:00:00Z"), now)).toBe(false);
    expect(weeklyDue(new Date("2026-11-14T12:00:00Z"), now)).toBe(true);
  });
});
