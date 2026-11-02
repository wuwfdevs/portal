import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  dayOfWeekISO,
  daysBetweenISO,
  eachDateISO,
  isValidDateISO,
  weekStartISO,
} from "./dates";

describe("isValidDateISO", () => {
  it("accepts real dates, including leap day", () => {
    expect(isValidDateISO("2026-10-09")).toBe(true);
    expect(isValidDateISO("2028-02-29")).toBe(true);
  });

  it("rejects dates Date would roll over", () => {
    expect(isValidDateISO("2026-02-30")).toBe(false);
    expect(isValidDateISO("2026-02-29")).toBe(false);
    expect(isValidDateISO("2026-04-31")).toBe(false);
    expect(isValidDateISO("2026-13-01")).toBe(false);
    expect(isValidDateISO("2026-00-10")).toBe(false);
  });

  it("rejects malformed and non-string values", () => {
    for (const bad of [
      "",
      "2026-1-5",
      "10/09/2026",
      "2026-10-09T00:00:00Z",
      null,
      undefined,
      20261009,
    ]) {
      expect(isValidDateISO(bad)).toBe(false);
    }
  });
});

describe("date arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("numbers weekdays from Sunday", () => {
    expect(dayOfWeekISO("2026-10-04")).toBe(0);
    expect(dayOfWeekISO("2026-10-09")).toBe(5);
  });

  it("finds the Monday of a Monday-to-Sunday week", () => {
    expect(weekStartISO("2026-10-05")).toBe("2026-10-05");
    expect(weekStartISO("2026-10-11")).toBe("2026-10-05");
    expect(weekStartISO("2026-10-04")).toBe("2026-09-28");
  });

  it("walks an inclusive range and counts days between", () => {
    expect([...eachDateISO("2026-10-30", "2026-11-02")]).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect([...eachDateISO("2026-10-02", "2026-10-01")]).toEqual([]);
    expect(daysBetweenISO("2026-10-01", "2026-10-09")).toBe(8);
  });
});
