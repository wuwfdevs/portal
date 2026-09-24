import { describe, expect, it } from "vitest";
import { computeEndTime, formatAirTime, isScheduleEntryActiveOn, type ScheduleEntryLike } from "./schedule";

function entry(overrides: Partial<ScheduleEntryLike> = {}): ScheduleEntryLike {
  return {
    entry_type: "recurring",
    days_of_week: [],
    start_date: "2026-01-01",
    end_date: null,
    ...overrides,
  };
}

describe("isScheduleEntryActiveOn", () => {
  it("is inactive before its start date", () => {
    expect(isScheduleEntryActiveOn(entry({ start_date: "2026-08-10" }), "2026-08-01")).toBe(false);
  });

  it("is inactive after its end date", () => {
    expect(isScheduleEntryActiveOn(entry({ end_date: "2026-08-01" }), "2026-08-02")).toBe(false);
  });

  it("with no days_of_week set, covers every day in range", () => {
    expect(isScheduleEntryActiveOn(entry(), "2026-08-06")).toBe(true);
  });

  // 2026-08-06 is a Thursday (day 4).
  it("for a recurring entry, only matches its listed weekdays", () => {
    expect(isScheduleEntryActiveOn(entry({ days_of_week: [4] }), "2026-08-06")).toBe(true);
    expect(isScheduleEntryActiveOn(entry({ days_of_week: [1, 2, 3, 5] }), "2026-08-06")).toBe(false);
  });

  it("days_of_week does not gate an override or holiday entry", () => {
    expect(
      isScheduleEntryActiveOn(entry({ entry_type: "holiday", days_of_week: [1] }), "2026-08-06"),
    ).toBe(true);
  });
});

describe("formatAirTime", () => {
  it("formats midnight and noon as 12, not 0", () => {
    expect(formatAirTime("00:00:00")).toBe("12:00 AM");
    expect(formatAirTime("12:00:00")).toBe("12:00 PM");
  });

  it("formats morning and afternoon hours with AM/PM and zero-padded minutes", () => {
    expect(formatAirTime("05:00:00")).toBe("5:00 AM");
    expect(formatAirTime("17:04:00")).toBe("5:04 PM");
  });
});

describe("computeEndTime", () => {
  it("adds duration within the same day", () => {
    expect(computeEndTime("05:00:00", 240)).toBe("9:00 AM");
  });

  it("wraps past midnight", () => {
    expect(computeEndTime("23:00:00", 90)).toBe("12:30 AM");
  });
});
