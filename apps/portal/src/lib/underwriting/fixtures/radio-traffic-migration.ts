// The instructions the first real legacy migration ("Radio Traffic
// Migration", 2026-09-30) left unsaved, as the reader should have read them
// under the pool rules in agreement-ai-import.ts (docs/underwriting-traffic-
// redesign.md §14.6). Each is the order's own wording and dates; the tests
// check that every one compiles to the count the order states, and the same
// readings were used to add the missing lines to those drafts.

import type { AgreementModelLine } from "../agreement-import";

function line(overrides: Partial<AgreementModelLine>): AgreementModelLine {
  return {
    label: "",
    source_text: "",
    entry_kind: "weekly_quota",
    count_per_day: null,
    quantity: null,
    interval_weeks: null,
    explicit_dates: [],
    week_grid: [],
    days_of_week: [],
    pool: null,
    program: null,
    time_mode: "any",
    window_start: null,
    window_end: null,
    preferred_time: null,
    max_per_day: null,
    service_level: "guaranteed",
    duration_seconds: null,
    start_date: "",
    end_date: null,
    flight: null,
    stated_total: null,
    notes: null,
    ...overrides,
  };
}

export interface MigrationCorrection {
  sponsor: string;
  /** The unresolved source_text each line replaces, as the first reading recorded it. */
  replaces: string[];
  lines: AgreementModelLine[];
  /** What the lines together must compile to — the order's own count. */
  expectedTotal: number;
}

export const RADIO_TRAFFIC_MIGRATION_CORRECTIONS: MigrationCorrection[] = [
  {
    sponsor: "Boyles and Boyles",
    replaces: [
      "104 Drive Time Spots: 2 Drive Time spots each week",
      "52 Weekend Edition spots: 1 each week in either Sat. or Sun WE",
    ],
    lines: [
      line({
        label: "Drive Time",
        source_text: "104 Drive Time Spots: 2 Drive Time spots each week",
        quantity: 2,
        pool: "Drive Time",
        start_date: "2026-09-21",
        end_date: "2027-09-19",
        stated_total: 104,
      }),
      line({
        label: "Weekend Edition",
        source_text: "52 Weekend Edition spots: 1 each week in either Sat. or Sun WE",
        quantity: 1,
        pool: "Weekend Edition",
        start_date: "2026-09-21",
        end_date: "2027-09-19",
        stated_total: 52,
      }),
    ],
    expectedTotal: 156,
  },
  {
    // "1 Rotating AM/PM Drive" a week: AM one week, PM the next.
    sponsor: "International Paper",
    replaces: ["1 Rotating AM/PM Drive"],
    lines: [
      line({
        label: "Rotating AM/PM Drive — AM weeks",
        source_text: "1 Rotating AM/PM Drive",
        entry_kind: "every_n_weeks",
        quantity: 1,
        interval_weeks: 2,
        pool: "Weekday AM Drive",
        start_date: "2026-05-04",
        end_date: "2027-05-02",
      }),
      line({
        label: "Rotating AM/PM Drive — PM weeks",
        source_text: "1 Rotating AM/PM Drive",
        entry_kind: "every_n_weeks",
        quantity: 1,
        interval_weeks: 2,
        pool: "Weekday PM Drive",
        start_date: "2026-05-11",
        end_date: "2027-05-02",
      }),
    ],
    expectedTotal: 52,
  },
  {
    sponsor: "Innisfree Jet Center",
    replaces: [
      "One radio spot per day Monday through Sunday to run between 5 a.m. and 9:58 p.m on 88.1 FM.",
    ],
    lines: [
      line({
        label: "Daily, 5 a.m.–9:58 p.m.",
        source_text:
          "One radio spot per day Monday through Sunday to run between 5 a.m. and 9:58 p.m on 88.1 FM.",
        entry_kind: "fixed_days",
        count_per_day: 1,
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
        pool: "Total Program Rotation",
        time_mode: "window",
        window_start: "05:00",
        window_end: "21:58",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
      }),
    ],
    expectedTotal: 365,
  },
  {
    // Learning Minute is a one-minute recorded product, not a pool.
    sponsor: "Dauphin Island Sea Lab",
    replaces: ["Learning Minute Spot each week on Wednesday 7:19 am"],
    lines: [
      line({
        label: "Learning Minute — Wednesday 7:19 AM",
        source_text: "Learning Minute Spot each week on Wednesday 7:19 am",
        entry_kind: "fixed_days",
        count_per_day: 1,
        days_of_week: [3],
        pool: "Total Program Rotation",
        time_mode: "exact",
        preferred_time: "07:19",
        duration_seconds: 60,
        start_date: "2026-08-03",
        end_date: "2027-08-01",
      }),
    ],
    expectedTotal: 52,
  },
  {
    sponsor: "TLC Caregiver",
    replaces: ["52 spots for Learning Minute: 1 each week Thursday @ 7:49 AM"],
    lines: [
      line({
        label: "Learning Minute — Thursday 7:49 AM",
        source_text: "52 spots for Learning Minute: 1 each week Thursday @ 7:49 AM",
        entry_kind: "fixed_days",
        count_per_day: 1,
        days_of_week: [4],
        pool: "Total Program Rotation",
        time_mode: "exact",
        preferred_time: "07:49",
        duration_seconds: 60,
        start_date: "2026-01-12",
        end_date: "2027-01-10",
        stated_total: 52,
      }),
    ],
    expectedTotal: 52,
  },
];
