import { describe, expect, it } from "vitest";
import {
  EXACT_TIME_TOLERANCE_MINUTES,
  bucketForDate,
  eligibleDatesInBucket,
  isDateEligible,
  isTimeEligible,
  type LineEligibilityLike,
} from "./eligibility";

const base: LineEligibilityLike = {
  days_of_week: [1, 2, 3, 4, 5],
  start_date: "2026-10-05",
  end_date: "2026-10-25",
  status: "active",
  cancelled_from: null,
  time_mode: "any",
  preferred_time: null,
  window_start: null,
  window_end: null,
  required_opportunity_key: null,
  max_per_day: null,
};

const buckets = [
  {
    id: "w1",
    period_start: "2026-10-05",
    period_end: "2026-10-11",
    quantity_required: 2,
    status: "active" as const,
  },
  {
    id: "w2",
    period_start: "2026-10-12",
    period_end: "2026-10-18",
    quantity_required: 0,
    status: "active" as const,
  },
  {
    id: "w3",
    period_start: "2026-10-19",
    period_end: "2026-10-25",
    quantity_required: 2,
    status: "superseded" as const,
  },
];

describe("isDateEligible / bucketForDate", () => {
  it("finds the active bucket covering an eligible weekday", () => {
    expect(bucketForDate(base, buckets, "2026-10-07")?.id).toBe("w1");
  });
  it("refuses a weekend for a weekday line, a zero bucket, a superseded bucket, and dates outside the line", () => {
    expect(bucketForDate(base, buckets, "2026-10-10")).toBeNull();
    expect(bucketForDate(base, buckets, "2026-10-14")).toBeNull();
    expect(bucketForDate(base, buckets, "2026-10-21")).toBeNull();
    expect(bucketForDate(base, buckets, "2026-10-02")).toBeNull();
  });
  it("refuses dates on or after a cancellation", () => {
    const cancelled = { ...base, status: "cancelled" as const, cancelled_from: "2026-10-07" };
    expect(isDateEligible(cancelled, "2026-10-06")).toBe(true);
    expect(isDateEligible(cancelled, "2026-10-07")).toBe(false);
  });
  it("lists a bucket's eligible dates under the line's weekdays", () => {
    expect(eligibleDatesInBucket(base, buckets[0]!)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
    ]);
    expect(eligibleDatesInBucket({ ...base, days_of_week: [] }, buckets[0]!)).toHaveLength(7);
  });
});

describe("isTimeEligible", () => {
  it("any and preferred never exclude", () => {
    expect(isTimeEligible({ ...base, time_mode: "any" }, 0, null)).toBe(true);
    expect(
      isTimeEligible({ ...base, time_mode: "preferred", preferred_time: "07:49" }, 20 * 60, null),
    ).toBe(true);
  });
  it("window is inclusive at the start and exclusive at the end", () => {
    const line = {
      ...base,
      time_mode: "window" as const,
      window_start: "05:00",
      window_end: "09:00",
    };
    expect(isTimeEligible(line, 5 * 60, null)).toBe(true);
    expect(isTimeEligible(line, 8 * 60 + 59, null)).toBe(true);
    expect(isTimeEligible(line, 9 * 60, null)).toBe(false);
  });
  it("exact allows the tolerance and no more", () => {
    const line = { ...base, time_mode: "exact" as const, preferred_time: "08:44" };
    expect(isTimeEligible(line, 8 * 60 + 44, null)).toBe(true);
    expect(isTimeEligible(line, 8 * 60 + 44 + EXACT_TIME_TOLERANCE_MINUTES, null)).toBe(true);
    expect(isTimeEligible(line, 8 * 60 + 44 + EXACT_TIME_TOLERANCE_MINUTES + 1, null)).toBe(false);
  });
  it("slot needs the same traffic key", () => {
    const line = {
      ...base,
      time_mode: "slot" as const,
      required_opportunity_key: "marketplace.opening",
    };
    expect(isTimeEligible(line, 17 * 60, "marketplace.opening")).toBe(true);
    expect(isTimeEligible(line, 17 * 60, "marketplace.closing")).toBe(false);
    expect(isTimeEligible(line, 17 * 60, null)).toBe(false);
  });
});
