import { describe, expect, it } from "vitest";
import { formatHour, parseNprMapping } from "./program-npr";

describe("parseNprMapping", () => {
  it("disconnects on a blank collection id, dropping the feed hour with it", () => {
    expect(parseNprMapping("", "5")).toEqual({
      ok: true,
      collectionId: null,
      feedStartHourEt: null,
    });
  });
  it("accepts a collection id alone", () => {
    expect(parseNprMapping(" 3 ", "")).toEqual({
      ok: true,
      collectionId: 3,
      feedStartHourEt: null,
    });
  });
  it("accepts a collection id with a feed hour", () => {
    expect(parseNprMapping("3", "5")).toEqual({ ok: true, collectionId: 3, feedStartHourEt: 5 });
    expect(parseNprMapping("3", "0")).toEqual({ ok: true, collectionId: 3, feedStartHourEt: 0 });
  });
  it("refuses a collection id that isn't a positive whole number", () => {
    for (const raw of ["abc", "3.5", "-3", "0", "1e3", "99999999999"]) {
      expect(parseNprMapping(raw, "").ok).toBe(false);
    }
  });
  it("refuses a feed hour outside the day", () => {
    expect(parseNprMapping("3", "24").ok).toBe(false);
    expect(parseNprMapping("3", "five").ok).toBe(false);
  });
});

describe("formatHour", () => {
  it("formats midnight, morning, noon and evening", () => {
    expect(formatHour(0)).toBe("12 AM");
    expect(formatHour(5)).toBe("5 AM");
    expect(formatHour(12)).toBe("12 PM");
    expect(formatHour(17)).toBe("5 PM");
  });
});
