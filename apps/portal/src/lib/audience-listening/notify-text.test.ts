import { describe, expect, it } from "vitest";
import { facilitatorLinkEmailText, hostRequestEmailText, parseNotifyAddress } from "./notify-text";

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
