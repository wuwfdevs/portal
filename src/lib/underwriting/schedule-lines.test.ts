import { describe, expect, it } from "vitest";
import {
  countWeekdayOccurrences,
  describeScheduleLineRecurrence,
  expectedOccurrenceCount,
  remainingOccurrenceDates,
  sumExpectedOccurrences,
  type ScheduleLineOccurrenceLike,
} from "./schedule-lines";

describe("countWeekdayOccurrences", () => {
  it("counts every Monday across 26 weeks", () => {
    // 2026-08-03 is a Monday; 26 weeks later (inclusive of both ends) is 2027-01-31.
    expect(countWeekdayOccurrences([1], "2026-08-03", "2027-01-31")).toBe(26);
  });

  it("counts a two-day-a-week line across the same 26 weeks", () => {
    expect(countWeekdayOccurrences([3, 4], "2026-08-03", "2027-01-31")).toBe(52);
  });

  it("returns 0 for an empty days_of_week list", () => {
    expect(countWeekdayOccurrences([], "2026-08-03", "2027-01-31")).toBe(0);
  });

  it("returns 0 when the end date precedes the start date", () => {
    expect(countWeekdayOccurrences([1], "2026-08-10", "2026-08-03")).toBe(0);
  });
});

function line(overrides: Partial<ScheduleLineOccurrenceLike> = {}): ScheduleLineOccurrenceLike {
  return {
    days_of_week: [1],
    start_date: "2026-08-03",
    end_date: "2027-01-31",
    occurrence_count_override: null,
    ...overrides,
  };
}

describe("expectedOccurrenceCount", () => {
  it("computes from days_of_week x date range when no override is set", () => {
    expect(expectedOccurrenceCount(line())).toBe(26);
  });

  it("an explicit override wins outright", () => {
    expect(expectedOccurrenceCount(line({ occurrence_count_override: 12 }))).toBe(12);
  });

  it("is null (open-ended, no fixed total) with no end_date and no override", () => {
    expect(expectedOccurrenceCount(line({ end_date: null }))).toBeNull();
  });
});

describe("sumExpectedOccurrences — the real Autumn Beck Blackledge agreement", () => {
  it("four weekly recurring lines over the same 26-week campaign total exactly 104", () => {
    const lines: ScheduleLineOccurrenceLike[] = [
      line({ days_of_week: [1] }), // Monday
      line({ days_of_week: [2] }), // Tuesday
      line({ days_of_week: [3, 4] }), // Wednesday + Thursday
    ];
    expect(sumExpectedOccurrences(lines)).toBe(104);
  });

  it("is null if any line is open-ended", () => {
    const lines: ScheduleLineOccurrenceLike[] = [line(), line({ end_date: null })];
    expect(sumExpectedOccurrences(lines)).toBeNull();
  });
});

describe("remainingOccurrenceDates", () => {
  it("lists every remaining matching weekday through end_date", () => {
    expect(
      remainingOccurrenceDates(line({ days_of_week: [1], start_date: "2026-08-03", end_date: "2026-08-24" }), "2026-08-01", []),
    ).toEqual(["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"]);
  });

  it("starts from today when today is later than start_date", () => {
    expect(
      remainingOccurrenceDates(line({ days_of_week: [1], start_date: "2026-08-03", end_date: "2026-08-24" }), "2026-08-11", []),
    ).toEqual(["2026-08-17", "2026-08-24"]);
  });

  it("excludes dates already covered by an active placement", () => {
    expect(
      remainingOccurrenceDates(
        line({ days_of_week: [1], start_date: "2026-08-03", end_date: "2026-08-24" }),
        "2026-08-01",
        ["2026-08-10", "2026-08-24"],
      ),
    ).toEqual(["2026-08-03", "2026-08-17"]);
  });

  it("is empty for an open-ended line with no end_date", () => {
    expect(remainingOccurrenceDates(line({ end_date: null }), "2026-08-01", [])).toEqual([]);
  });

  it("is empty for a non-day-of-week line (occurrence_count_override set)", () => {
    expect(remainingOccurrenceDates(line({ occurrence_count_override: 12 }), "2026-08-01", [])).toEqual([]);
  });

  it("respects the maxDates safety cap", () => {
    const result = remainingOccurrenceDates(
      line({ days_of_week: [1], start_date: "2026-08-03", end_date: "2027-01-31" }),
      "2026-08-01",
      [],
      3,
    );
    expect(result).toHaveLength(3);
  });
});

describe("describeScheduleLineRecurrence", () => {
  it("formats days in calendar order with the target time", () => {
    expect(describeScheduleLineRecurrence({ days_of_week: [4, 3], target_time: "08:06" })).toBe("Wed/Thu ~08:06");
  });

  it("omits the time when none is set", () => {
    expect(describeScheduleLineRecurrence({ days_of_week: [1], target_time: null })).toBe("Mon");
  });
});
