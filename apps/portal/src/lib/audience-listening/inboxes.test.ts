import { describe, expect, it } from "vitest";
import {
  HOST_REQUEST_STATES,
  INBOX_STATES,
  countStates,
  daysWaiting,
  hostRequestIsOverdue,
  hostRequestMatches,
  inboxMatches,
  isHostRequestState,
  isInboxState,
  parseHostRequestFilter,
  parseInboxFilter,
} from "./inboxes";

const NOW = new Date("2026-11-10T12:00:00Z");

describe("daysWaiting", () => {
  it("counts whole days and never goes negative", () => {
    expect(daysWaiting("2026-11-10T11:00:00Z", NOW)).toBe(0);
    expect(daysWaiting("2026-11-05T12:00:00Z", NOW)).toBe(5);
    expect(daysWaiting("2026-11-05T13:00:00Z", NOW)).toBe(4);
    expect(daysWaiting("2026-11-20T12:00:00Z", NOW)).toBe(0);
    expect(daysWaiting("not a date", NOW)).toBe(0);
  });
});

describe("hostRequestIsOverdue", () => {
  it("flags a new request from five days ago, not four", () => {
    expect(hostRequestIsOverdue({ state: "new", created_at: "2026-11-05T12:00:00Z" }, NOW)).toBe(true);
    expect(hostRequestIsOverdue({ state: "new", created_at: "2026-11-06T12:00:00Z" }, NOW)).toBe(false);
  });
  it("does not flag one a person has already picked up", () => {
    for (const state of ["contacted", "scheduled", "declined"] as const) {
      expect(hostRequestIsOverdue({ state, created_at: "2026-10-01T00:00:00Z" }, NOW)).toBe(false);
    }
  });
});

describe("filters", () => {
  it("read a state, all, or fall back to open", () => {
    expect(parseInboxFilter("answered")).toBe("answered");
    expect(parseInboxFilter("all")).toBe("all");
    expect(parseInboxFilter("nonsense")).toBe("open");
    expect(parseInboxFilter(undefined)).toBe("open");
    expect(parseHostRequestFilter("scheduled")).toBe("scheduled");
    expect(parseHostRequestFilter("answered")).toBe("open");
  });
  it("show what still needs a person under open", () => {
    expect(INBOX_STATES.filter((s) => inboxMatches(s, "open"))).toEqual(["new", "read"]);
    expect(HOST_REQUEST_STATES.filter((s) => hostRequestMatches(s, "open"))).toEqual(["new", "contacted"]);
    expect(INBOX_STATES.every((s) => inboxMatches(s, "all"))).toBe(true);
    expect(inboxMatches("declined", "declined")).toBe(true);
    expect(inboxMatches("new", "declined")).toBe(false);
  });
});

describe("state guards and counts", () => {
  it("accept only the database's states", () => {
    expect(isInboxState("read")).toBe(true);
    expect(isInboxState("contacted")).toBe(false);
    expect(isHostRequestState("contacted")).toBe(true);
    expect(isHostRequestState("read")).toBe(false);
  });
  it("count rows per state", () => {
    expect(countStates([{ state: "new" }, { state: "new" }, { state: "read" }])).toEqual({ new: 2, read: 1 });
  });
});
