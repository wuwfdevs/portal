import { describe, expect, it } from "vitest";
import { hostRequestEmailText, parseNotifyAddress } from "./notify-text";

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
