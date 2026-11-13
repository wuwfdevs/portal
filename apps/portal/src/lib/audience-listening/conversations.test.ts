import { describe, expect, it } from "vitest";
import { canSendToSourcework, cardNeedsContactWarning, formatMs } from "./conversations";

describe("formatMs", () => {
  it("reads a position in a recording", () => {
    expect(formatMs(0)).toBe("0:00");
    expect(formatMs(65_000)).toBe("1:05");
    expect(formatMs(3_909_000)).toBe("1:05:09");
    expect(formatMs(-5)).toBe("0:00");
  });
});

describe("cardNeedsContactWarning", () => {
  it("warns only when contact is allowed and there is no way to reach the person", () => {
    expect(cardNeedsContactWarning({ may_contact: true, contact: null })).toBe(true);
    expect(cardNeedsContactWarning({ may_contact: true, contact: "  " })).toBe(true);
    expect(cardNeedsContactWarning({ may_contact: true, contact: "a@x.org" })).toBe(false);
    expect(cardNeedsContactWarning({ may_contact: false, contact: null })).toBe(false);
  });
});

describe("canSendToSourcework", () => {
  it("allows a whole recording, including one the facilitator already sent", () => {
    expect(canSendToSourcework({ status: "complete", sourcework_source_id: null })).toBe(true);
    expect(canSendToSourcework({ status: "sent", sourcework_source_id: null })).toBe(true);
  });
  it("refuses a recording still coming in, or one already in Sourcework", () => {
    expect(canSendToSourcework({ status: "recording", sourcework_source_id: null })).toBe(false);
    expect(canSendToSourcework({ status: "uploading", sourcework_source_id: null })).toBe(false);
    expect(canSendToSourcework({ status: "complete", sourcework_source_id: "x" })).toBe(false);
  });
});
