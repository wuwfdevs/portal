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
    entry_kind: "fixed_days",
    days_of_week: [1, 2, 3, 4, 5],
    count_per_day: "1",
    quantity: "",
    interval_weeks: "",
    pool_id: "pool-am",
    program_id: "",
    time_mode: "any",
    window_start: "",
    window_end: "",
    preferred_time: "",
    max_per_day: "",
    service_level: "guaranteed",
    duration_seconds: "30",
    start_date: "2026-10-05",
    end_date: "2026-10-09",
    flight_id: "",
    stated_total: "5",
    source_text: "",
    makegood_policy_text: "",
    notes: "",
    explicit_dates: [],
    week_grid: [],
    ...overrides,
  };
}

describe("parseExplicitDates", () => {
  it("reads one row per date, a blank count as 1, and sums a repeated date", () => {
    expect(
      parseExplicitDates([
        { date: "2026-09-11", quantity: "" },
        { date: "2026-09-24", quantity: "2" },
        { date: "2026-09-11", quantity: "1" },
        { date: "", quantity: "" },
      ]),
    ).toEqual({
      ok: true,
      value: [
        { date: "2026-09-11", quantity: 2 },
        { date: "2026-09-24", quantity: 2 },
      ],
    });
  });
  it("rejects a non-date and a zero count", () => {
    expect(parseExplicitDates([{ date: "Sept 11", quantity: "" }]).ok).toBe(false);
    expect(parseExplicitDates([{ date: "2026-09-11", quantity: "0" }]).ok).toBe(false);
  });
});

describe("parseWeekGrid", () => {
  it("reads one quantity per Monday, a blank as a dark week, inside the line's dates", () => {
    expect(
      parseWeekGrid(
        [
          { week_start: "2026-01-26", quantity: "6" },
          { week_start: "2026-02-02", quantity: "4" },
          { week_start: "2026-02-09", quantity: "" },
          { week_start: "2026-02-16", quantity: "3" },
        ],
        "2026-01-26",
        "2026-02-22",
      ),
    ).toEqual({
      ok: true,
      value: [
        { week_start: "2026-01-26", quantity: 6 },
        { week_start: "2026-02-02", quantity: 4 },
        { week_start: "2026-02-09", quantity: 0 },
        { week_start: "2026-02-16", quantity: 3 },
      ],
    });
  });
  it("refuses a week that is not keyed by its Monday, or that falls outside the line", () => {
    expect(
      parseWeekGrid([{ week_start: "2026-01-28", quantity: "6" }], "2026-01-26", "2026-02-22").ok,
    ).toBe(false);
    expect(
      parseWeekGrid([{ week_start: "2026-03-02", quantity: "6" }], "2026-01-26", "2026-02-22").ok,
    ).toBe(false);
  });
});

describe("parseScheduleLineForm", () => {
  it("builds a fixed-days line and its buckets", () => {
    const result = parseScheduleLineForm(values());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.line).toMatchObject({
      entry_kind: "fixed_days",
      entry_spec: { kind: "fixed_days", count_per_day: 1 },
      days_of_week: [1, 2, 3, 4, 5],
      max_per_day: null,
      time_mode: "any",
      service_level: "guaranteed",
      stated_total: 5,
    });
    expect(result.value.buckets).toHaveLength(5);
  });

  it("requires a pool or a program", () => {
    expect(parseScheduleLineForm(values({ pool_id: "" })).ok).toBe(false);
  });

  it("builds a weekly quota with an optional per-day cap, and every-other-week from an interval", () => {
    const quota = parseScheduleLineForm(
      values({
        entry_kind: "weekly_quota",
        quantity: "4",
        count_per_day: "",
        max_per_day: "1",
        end_date: "2026-10-18",
      }),
    );
    expect(quota.ok && quota.value.line.entry_spec).toEqual({ kind: "weekly_quota", quantity: 4 });
    expect(quota.ok && quota.value.line.max_per_day).toBe(1);
    expect(quota.ok && quota.value.buckets).toHaveLength(2);

    const alternate = parseScheduleLineForm(
      values({
        entry_kind: "every_n_weeks",
        quantity: "1",
        count_per_day: "",
        interval_weeks: "2",
        days_of_week: [],
        end_date: "2026-11-01",
      }),
    );
    expect(alternate.ok && alternate.value.buckets.map((b) => b.periodStart)).toEqual([
      "2026-10-05",
      "2026-10-19",
    ]);
    expect(
      parseScheduleLineForm(
        values({
          entry_kind: "every_n_weeks",
          quantity: "1",
          count_per_day: "",
          interval_weeks: "1",
        }),
      ).ok,
    ).toBe(false);
  });

  it("refuses a field the chosen kind does not use, rather than ignoring it", () => {
    const result = parseScheduleLineForm(values({ quantity: "4" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/Quantity isn't used by a fixed-days line/);
    expect(
      parseScheduleLineForm(
        values({ entry_kind: "weekly_quota", quantity: "4", count_per_day: "1" }),
      ).ok,
    ).toBe(false);
  });

  it("builds a week grid laid out between the line's dates, dark weeks included", () => {
    const grid = parseScheduleLineForm(
      values({
        entry_kind: "week_grid",
        count_per_day: "",
        days_of_week: [0, 6],
        start_date: "2025-08-11",
        end_date: "2025-08-31",
        week_grid: [
          { week_start: "2025-08-11", quantity: "6" },
          { week_start: "2025-08-18", quantity: "" },
          { week_start: "2025-08-25", quantity: "6" },
        ],
        stated_total: "12",
      }),
    );
    expect(grid.ok && grid.value.buckets.map((b) => [b.periodStart, b.quantity])).toEqual([
      ["2025-08-11", 6],
      ["2025-08-18", 0],
      ["2025-08-25", 6],
    ]);
    expect(
      parseScheduleLineForm(
        values({ entry_kind: "week_grid", count_per_day: "", end_date: "", week_grid: [] }),
      ).ok,
    ).toBe(false);
  });

  it("builds an explicit-dates line and a range total", () => {
    const explicit = parseScheduleLineForm(
      values({
        entry_kind: "explicit_dates",
        days_of_week: [],
        count_per_day: "",
        explicit_dates: [
          { date: "2026-10-06", quantity: "" },
          { date: "2026-10-08", quantity: "2" },
        ],
      }),
    );
    expect(explicit.ok && explicit.value.buckets.map((b) => [b.periodStart, b.quantity])).toEqual([
      ["2026-10-06", 1],
      ["2026-10-08", 2],
    ]);
    const total = parseScheduleLineForm(
      values({ entry_kind: "range_total", quantity: "13", count_per_day: "", days_of_week: [] }),
    );
    expect(total.ok && total.value.buckets).toEqual([
      {
        periodStart: "2026-10-05",
        periodEnd: "2026-10-09",
        quantity: 13,
        sourceLabel: "Oct 5 – Oct 9",
        partial: false,
      },
    ]);
  });

  it("validates each time mode's own fields", () => {
    expect(parseScheduleLineForm(values({ time_mode: "window", window_start: "05:00" })).ok).toBe(
      false,
    );
    expect(
      parseScheduleLineForm(
        values({ time_mode: "window", window_start: "09:00", window_end: "05:00" }),
      ).ok,
    ).toBe(false);
    expect(parseScheduleLineForm(values({ time_mode: "exact" })).ok).toBe(false);
    expect(parseScheduleLineForm(values({ time_mode: "opening", pool_id: "pool-am" })).ok).toBe(
      false,
    );
    const opening = parseScheduleLineForm(
      values({ time_mode: "opening", pool_id: "", program_id: "marketplace" }),
    );
    expect(opening.ok && opening.value.line).toMatchObject({
      time_mode: "opening",
      program_id: "marketplace",
      preferred_time: null,
      window_start: null,
    });
    const exact = parseScheduleLineForm(values({ time_mode: "exact", preferred_time: "08:44" }));
    expect(exact.ok && exact.value.line.preferred_time).toBe("08:44");
  });

  it("rejects a line that compiles to nothing", () => {
    expect(
      parseScheduleLineForm(
        values({ days_of_week: [6], start_date: "2026-10-05", end_date: "2026-10-09" }),
      ).ok,
    ).toBe(false);
  });
});
