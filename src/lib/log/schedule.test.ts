import { describe, expect, it } from "vitest";
import { isScheduleEntryActiveOn, type ScheduleEntryLike } from "./schedule";

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
