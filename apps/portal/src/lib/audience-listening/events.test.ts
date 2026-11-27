import { describe, expect, it } from "vitest";
import {
  availableEventActions,
  availableListingActions,
  eventIsDeletable,
  eventSpanProblem,
  HOSTING_HELP,
  HOSTING_LABEL,
  HOSTING_VALUES,
  isHosting,
  missingListingChecks,
  LISTING_CHECKLIST,
  nextTableNumber,
  seatsLeft,
  tableIsRemovable,
  validateEventInput,
} from "./events";

const base = {
  title: "Listening night",
  startsAt: "2026-12-05T18:00:00Z",
  endsAt: "2026-12-05T20:00:00Z",
  placeName: "Public library",
  address: "200 Main St",
  visibility: "public",
  seats: 30,
};

describe("validateEventInput", () => {
  it("accepts a complete public event and a bare private one", () => {
    expect(validateEventInput(base)).toBeNull();
    expect(validateEventInput({ ...base, visibility: "private", address: null, seats: null })).toBeNull();
  });
  it("needs an address and seats before an event can be public", () => {
    expect(validateEventInput({ ...base, address: "" })).toMatch(/address/);
    expect(validateEventInput({ ...base, seats: null })).toMatch(/seats/);
  });
  it("needs the event to end after it starts", () => {
    expect(validateEventInput({ ...base, endsAt: base.startsAt })).toMatch(/end after/);
    expect(validateEventInput({ ...base, startsAt: null })).toMatch(/starts/);
  });
  it("keeps seats a whole number in range", () => {
    expect(validateEventInput({ ...base, seats: 0 })).toMatch(/Seats/);
    expect(validateEventInput({ ...base, seats: 501 })).toMatch(/Seats/);
    expect(validateEventInput({ ...base, seats: 2.5 })).toMatch(/Seats/);
  });
});

describe("listing", () => {
  it("asks for every item on the checklist before approval", () => {
    expect(missingListingChecks([])).toHaveLength(LISTING_CHECKLIST.length);
    expect(missingListingChecks(LISTING_CHECKLIST.map((i) => i.key))).toEqual([]);
    expect(missingListingChecks(["public_place"])).toHaveLength(LISTING_CHECKLIST.length - 1);
  });
  it("lets any staff ask for review but only a coordinator decide (the database enforces the same)", () => {
    expect(availableListingActions("not_listed", "public", false)).toEqual(["request_review"]);
    expect(availableListingActions("pending_review", "public", false)).toEqual(["withdraw"]);
    expect(availableListingActions("pending_review", "public", true)).toEqual(["approve", "decline", "withdraw"]);
    expect(availableListingActions("listed", "public", false)).toEqual([]);
    expect(availableListingActions("listed", "public", true)).toEqual(["unlist"]);
    expect(availableListingActions("declined", "public", false)).toEqual(["request_review"]);
  });
  it("never offers listing for a private event", () => {
    for (const state of ["not_listed", "pending_review", "listed", "declined"] as const) {
      expect(availableListingActions(state, "private", true)).toEqual([]);
    }
  });
});

describe("tables and seats", () => {
  it("numbers the next table with the lowest free number", () => {
    expect(nextTableNumber([])).toBe(1);
    expect(nextTableNumber([1, 2, 4])).toBe(3);
    expect(nextTableNumber(Array.from({ length: 99 }, (_, i) => i + 1))).toBeNull();
  });
  it("counts seats left without going below zero, and none for an event with no limit", () => {
    expect(seatsLeft(30, 12)).toBe(18);
    expect(seatsLeft(30, 31)).toBe(0);
    expect(seatsLeft(null, 5)).toBeNull();
  });
  it("only removes a table nobody has agreed at, and deletes only an event nothing happened at", () => {
    expect(tableIsRemovable("waiting")).toBe(true);
    expect(tableIsRemovable("agreed")).toBe(false);
    expect(eventIsDeletable("draft")).toBe(true);
    expect(eventIsDeletable("scheduled")).toBe(false);
  });
  it("leaves 'happening now' and 'done' to the room's console", () => {
    expect(availableEventActions("draft")).toEqual(["schedule", "cancel"]);
    expect(availableEventActions("live")).toEqual([]);
    expect(availableEventActions("done")).toEqual([]);
  });
});

describe("planned length", () => {
  it("is optional, and a whole number of minutes in range when given", () => {
    expect(validateEventInput({ ...base, plannedMinutes: null })).toBeNull();
    expect(validateEventInput({ ...base, plannedMinutes: 90 })).toBeNull();
    expect(validateEventInput({ ...base, plannedMinutes: 5 })).toMatch(/planned length/);
    expect(validateEventInput({ ...base, plannedMinutes: 481 })).toMatch(/planned length/);
    expect(validateEventInput({ ...base, plannedMinutes: 45.5 })).toMatch(/planned length/);
  });
});

describe("eventSpanProblem (twin of al_events_check_query_span)", () => {
  const window = { opensAt: "2026-12-01T00:00:00Z", closesAt: "2026-12-31T00:00:00Z" };
  it("accepts a start inside the window, on either edge", () => {
    expect(eventSpanProblem("2026-12-05T18:00:00Z", window)).toBeNull();
    expect(eventSpanProblem("2026-12-01T00:00:00Z", window)).toBeNull();
    expect(eventSpanProblem("2026-12-31T00:00:00Z", window)).toBeNull();
  });
  it("names which side it falls on", () => {
    expect(eventSpanProblem("2026-11-30T23:59:00Z", window)).toMatch(/before the query opens/);
    expect(eventSpanProblem("2027-01-01T00:00:00Z", window)).toMatch(/after the query closes/);
  });
  it("treats a missing bound as no bound, and a missing date as a missing date", () => {
    expect(eventSpanProblem("2030-01-01T00:00:00Z", { opensAt: null, closesAt: null })).toBeNull();
    expect(eventSpanProblem("", window)).toMatch(/starts/);
  });
});

describe("hosting", () => {
  it("has a label and an explanation for every setting, and recognises only those", () => {
    for (const value of HOSTING_VALUES) {
      expect(HOSTING_LABEL[value]).toBeTruthy();
      expect(HOSTING_HELP[value]).toBeTruthy();
      expect(isHosting(value)).toBe(true);
    }
    expect(isHosting("everyone")).toBe(false);
    expect(HOSTING_VALUES[0]).toBe("staff_only");
  });
});
