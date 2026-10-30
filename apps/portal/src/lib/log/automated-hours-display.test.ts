import { describe, expect, it } from "vitest";
import {
  formatChangeWhen,
  formatEffectiveRange,
  formatWindowHours,
  localFormValues,
  programsInWindow,
  type ProgramAiringLike,
} from "./automated-hours-display";
import { stationLocalToUTC } from "./automated-hours";

const at = stationLocalToUTC;

describe("formatWindowHours", () => {
  it("reads as clock times", () => {
    expect(formatWindowHours("20:00:00", "05:00:00")).toBe("8:00 PM – 5:00 AM");
    expect(formatWindowHours("13:00:00", "17:00:00")).toBe("1:00 PM – 5:00 PM");
  });
});

describe("formatEffectiveRange", () => {
  it("shows the end date only when there is one", () => {
    expect(formatEffectiveRange("2026-10-07", null)).toBe("Oct 7, 2026");
    expect(formatEffectiveRange("2026-10-07", "2026-11-02")).toBe("Oct 7, 2026 – Nov 2, 2026");
  });
});

describe("formatChangeWhen", () => {
  it("names a span within one day", () => {
    expect(formatChangeWhen(at("2026-10-02", "05:00:00"), at("2026-10-02", "09:00:00"))).toBe(
      "Fri, Oct 2 · 5:00 – 9:00 AM",
    );
  });

  it("calls whole days all day, with an exclusive end", () => {
    expect(formatChangeWhen(at("2026-11-26", "00:00:00"), at("2026-11-27", "00:00:00"))).toBe(
      "Thu, Nov 26 · all day",
    );
    expect(formatChangeWhen(at("2026-12-24", "00:00:00"), at("2027-01-02", "00:00:00"))).toBe(
      "Thu, Dec 24 – Fri, Jan 1 · all day",
    );
  });

  it("treats ending at midnight as the same evening", () => {
    expect(formatChangeWhen(at("2026-10-03", "20:00:00"), at("2026-10-04", "00:00:00"))).toBe(
      "Sat, Oct 3 · 8:00 PM – 12:00 AM",
    );
  });

  it("spells out both ends across days", () => {
    expect(formatChangeWhen(at("2026-11-03", "20:00:00"), at("2026-11-04", "01:00:00"))).toBe(
      "Tue, Nov 3, 8:00 PM – Wed, Nov 4, 1:00 AM",
    );
  });
});

describe("localFormValues", () => {
  it("gives the station-local date and time", () => {
    expect(localFormValues(at("2026-10-02", "05:30:00"))).toEqual({
      date: "2026-10-02",
      time: "05:30",
    });
  });
});

describe("programsInWindow", () => {
  const entry = (overrides: Partial<ProgramAiringLike>): ProgramAiringLike => ({
    programName: "Program",
    entry_type: "recurring",
    days_of_week: [1, 2, 3, 4, 5],
    air_time: "05:00:00",
    duration_minutes: 240,
    start_date: "2026-01-01",
    end_date: null,
    ...overrides,
  });
  const entries = [
    entry({ programName: "Morning Edition" }),
    entry({
      programName: "Jazz After Hours",
      days_of_week: [],
      air_time: "20:00:00",
      duration_minutes: 540,
    }),
    entry({ programName: "World Cafe", days_of_week: [0, 6], air_time: "13:00:00" }),
    entry({ programName: "Old show", air_time: "21:00:00", end_date: "2026-01-31" }),
  ];

  it("finds the programs an overnight window covers, past midnight included", () => {
    const overnight = {
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startTime: "20:00:00",
      endTime: "05:00:00",
    };
    expect(programsInWindow(overnight, entries, "2026-10-01")).toEqual(["Jazz After Hours"]);
  });

  it("matches the window's days only", () => {
    const weekendAfternoon = { daysOfWeek: [0, 6], startTime: "13:00:00", endTime: "17:00:00" };
    expect(programsInWindow(weekendAfternoon, entries, "2026-10-01")).toEqual(["World Cafe"]);
    const weekdayMorning = { daysOfWeek: [6], startTime: "06:00:00", endTime: "07:00:00" };
    expect(programsInWindow(weekdayMorning, entries, "2026-10-01")).toEqual([]);
  });

  it("includes a program only partly inside the window", () => {
    const early = { daysOfWeek: [1], startTime: "04:00:00", endTime: "06:00:00" };
    expect(programsInWindow(early, entries, "2026-10-01")).toEqual([
      "Jazz After Hours",
      "Morning Edition",
    ]);
  });
});
