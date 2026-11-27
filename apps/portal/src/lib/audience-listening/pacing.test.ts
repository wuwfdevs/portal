import { describe, expect, it } from "vitest";
import {
  KITCHEN_TABLE_MINUTES,
  LAST_CALL_SECONDS,
  MIN_QUESTION_SECONDS,
  OPENING_SECONDS,
  describeSuggestedSeconds,
  plannedMinutesOf,
  suggestedSecondsPerQuestion,
} from "./pacing";

describe("plannedMinutesOf", () => {
  it("uses the event's own planned length when it has one", () => {
    expect(plannedMinutesOf({ plannedMinutes: 45, startsAt: "2026-12-01T18:00:00Z", endsAt: "2026-12-01T21:00:00Z" })).toBe(45);
  });
  it("falls back to the span between start and end", () => {
    expect(plannedMinutesOf({ plannedMinutes: null, startsAt: "2026-12-01T18:00:00Z", endsAt: "2026-12-01T19:30:00Z" })).toBe(90);
  });
  it("is at least one minute, and survives a bad date", () => {
    expect(plannedMinutesOf({ plannedMinutes: null, startsAt: "2026-12-01T18:00:00Z", endsAt: "2026-12-01T18:00:10Z" })).toBe(1);
    expect(plannedMinutesOf({ plannedMinutes: null, startsAt: "nope", endsAt: "nope" })).toBe(1);
  });
});

describe("suggestedSecondsPerQuestion", () => {
  it("shares the time left after the opening and the last call equally, rounded down to 15 seconds", () => {
    // 60 min = 3600 s; less 120 and 300 = 3180; over 3 questions = 1060; rounded down to 1050.
    expect(suggestedSecondsPerQuestion({ plannedMinutes: 60, questionCount: 3, hasOpening: true })).toBe(1050);
  });
  it("gives the opening's time back when the station has no opening", () => {
    // 3600 - 300 = 3300 over 3 = 1100, rounded down to 1095.
    expect(suggestedSecondsPerQuestion({ plannedMinutes: 60, questionCount: 3, hasOpening: false })).toBe(1095);
  });
  it("never suggests less than the minimum for a question, however short the session", () => {
    expect(suggestedSecondsPerQuestion({ plannedMinutes: 10, questionCount: 5, hasOpening: true })).toBe(MIN_QUESTION_SECONDS);
  });
  it("has nothing to suggest without questions", () => {
    expect(suggestedSecondsPerQuestion({ plannedMinutes: 60, questionCount: 0, hasOpening: true })).toBeNull();
    expect(suggestedSecondsPerQuestion({ plannedMinutes: 60, questionCount: 1.5, hasOpening: true })).toBeNull();
  });
  it("gives a longer session a longer suggestion", () => {
    const short = suggestedSecondsPerQuestion({ plannedMinutes: 30, questionCount: 3, hasOpening: true }) ?? 0;
    const long = suggestedSecondsPerQuestion({ plannedMinutes: 90, questionCount: 3, hasOpening: true }) ?? 0;
    expect(long).toBeGreaterThan(short);
  });
});

describe("describeSuggestedSeconds", () => {
  it("reads as a suggestion in whole minutes", () => {
    expect(describeSuggestedSeconds(1050)).toBe("about 18 minutes");
    expect(describeSuggestedSeconds(60)).toBe("about 1 minute");
    expect(describeSuggestedSeconds(20)).toBe("about 1 minute");
  });
});

describe("the constants", () => {
  it("keep the opening and last call a sensible part of the shortest kitchen table", () => {
    const shortest = Math.min(...KITCHEN_TABLE_MINUTES) * 60;
    expect(OPENING_SECONDS + LAST_CALL_SECONDS).toBeLessThan(shortest / 2);
  });
});
