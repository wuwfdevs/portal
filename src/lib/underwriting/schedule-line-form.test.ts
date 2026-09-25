import { describe, expect, it } from "vitest";
import {
  parseExplicitDates,
  parseScheduleLineForm,
  parseWeekGrid,
  type ScheduleLineFormValues,
} from "./schedule-line-form";

function values(overrides: Partial<ScheduleLineFormValues> = {}): ScheduleLineFormValues {
  return {
    label: "AM drive",
    rule_kind: "fixed_days",
    days_of_week: [1, 2, 3, 4, 5],
    count_per_day: "1",
    quantity_per_week: "",
    max_per_day: "",
    pool_id: "pool-am",
    program_id: "",
    window_start: "",
    window_end: "",
    target_time: "",
    duration_seconds: "30",
    start_date: "2026-10-05",
    end_date: "2026-10-09",
    flight_id: "",
    is_bonus: false,
    stated_total: "5",
    source_text: "",
    notes: "",
    allocations_text: "",
    grid_first_monday: "",
    grid_quantities: "",
    ...overrides,
  };
}

describe("parseExplicitDates", () => {
  it("reads one date per line with an optional count", () => {
    expect(parseExplicitDates("2026-09-11\n2026-09-24 x2, 2026-09-11")).toEqual({
      ok: true,
      value: [
        { period_kind: "day", period_start: "2026-09-11", quantity: 2 },
        { period_kind: "day", period_start: "2026-09-24", quantity: 2 },
      ],
    });
  });
  it("rejects a non-date", () => {
    expect(parseExplicitDates("Sept 11")).toMatchObject({ ok: false });
  });
});

describe("parseWeekGrid", () => {
  it("reads an agency run of quantities from a first Monday, zeros included", () => {
    const result = parseWeekGrid("", "2026-01-26", "6 4 0 3");
    expect(result).toEqual({
      ok: true,
      value: [
        { period_kind: "week", period_start: "2026-01-26", quantity: 6 },
        { period_kind: "week", period_start: "2026-02-02", quantity: 4 },
        { period_kind: "week", period_start: "2026-02-09", quantity: 0 },
        { period_kind: "week", period_start: "2026-02-16", quantity: 3 },
      ],
    });
  });
  it("snaps a per-line date to its Monday", () => {
    expect(parseWeekGrid("2026-01-28 6", "", "")).toEqual({
      ok: true,
      value: [{ period_kind: "week", period_start: "2026-01-26", quantity: 6 }],
    });
  });
});

describe("parseScheduleLineForm", () => {
  it("builds a fixed-days line", () => {
    const result = parseScheduleLineForm(values());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.line).toMatchObject({
        rule_kind: "fixed_days",
        count_per_day: 1,
        days_of_week: [1, 2, 3, 4, 5],
        stated_total: 5,
      });
      expect(result.value.allocations).toEqual([]);
    }
  });

  it("requires a pool or a program", () => {
    expect(parseScheduleLineForm(values({ pool_id: "", program_id: "" }))).toMatchObject({
      ok: false,
    });
  });

  it("builds a weekly quota with a default of one a day", () => {
    const result = parseScheduleLineForm(
      values({
        rule_kind: "weekly_quota",
        count_per_day: "",
        quantity_per_week: "3",
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { line: { quantity_per_week: 3, max_per_day: 1, count_per_day: null } },
    });
  });

  it("builds an explicit-dates line with no days", () => {
    const result = parseScheduleLineForm(
      values({
        rule_kind: "explicit_dates",
        allocations_text: "2026-10-16\n2026-10-22",
        count_per_day: "",
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { line: { days_of_week: [], count_per_day: null } },
    });
    if (result.ok) expect(result.value.allocations).toHaveLength(2);
  });

  it("rejects a half-specified window", () => {
    expect(parseScheduleLineForm(values({ window_start: "07:00" }))).toMatchObject({ ok: false });
  });
});
