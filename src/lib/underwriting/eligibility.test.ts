import { describe, expect, it } from "vitest";
import {
  EXACT_TIME_TOLERANCE_MINUTES,
  bucketForDate,
  eligibleDatesInBucket,
  isDateEligible,
  isTimeEligible,
  type LineEligibilityLike,
  isBreakPositionEligible,
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
    expect(isTimeEligible({ ...base, time_mode: "any" }, 0)).toBe(true);
    expect(
      isTimeEligible({ ...base, time_mode: "preferred", preferred_time: "07:49" }, 20 * 60),
    ).toBe(true);
  });
  it("window is inclusive at the start and exclusive at the end", () => {
    const line = {
      ...base,
      time_mode: "window" as const,
      window_start: "05:00",
      window_end: "09:00",
    };
    expect(isTimeEligible(line, 5 * 60)).toBe(true);
    expect(isTimeEligible(line, 8 * 60 + 59)).toBe(true);
    expect(isTimeEligible(line, 9 * 60)).toBe(false);
  });
  it("exact allows the tolerance and no more", () => {
    const line = { ...base, time_mode: "exact" as const, preferred_time: "08:44" };
    expect(isTimeEligible(line, 8 * 60 + 44)).toBe(true);
    expect(isTimeEligible(line, 8 * 60 + 44 + EXACT_TIME_TOLERANCE_MINUTES)).toBe(true);
    expect(isTimeEligible(line, 8 * 60 + 44 + EXACT_TIME_TOLERANCE_MINUTES + 1)).toBe(false);
  });
  it("opening and closing never exclude by clock time", () => {
    expect(isTimeEligible({ ...base, time_mode: "opening" as const }, 17 * 60)).toBe(true);
    expect(isTimeEligible({ ...base, time_mode: "closing" as const }, 17 * 60)).toBe(true);
  });
});

describe("isBreakPositionEligible", () => {
  const siblings = [
    {
      id: "billboard",
      scheduled_at: "2026-10-07T21:00:00Z",
      local_opportunity_id: "o1",
      permitted_content_types: ["promo"],
    },
    {
      id: "first",
      scheduled_at: "2026-10-07T21:01:00Z",
      local_opportunity_id: "o2",
      permitted_content_types: ["underwriting_credit"],
    },
    {
      id: "unmarked",
      scheduled_at: "2026-10-07T21:20:00Z",
      local_opportunity_id: null,
      permitted_content_types: ["underwriting_credit"],
    },
    {
      id: "middle",
      scheduled_at: "2026-10-07T21:30:00Z",
      local_opportunity_id: "o3",
      permitted_content_types: ["underwriting_credit"],
    },
    {
      id: "last",
      scheduled_at: "2026-10-07T21:58:00Z",
      local_opportunity_id: "o4",
      permitted_content_types: ["underwriting_credit", "psa"],
    },
  ];
  const opening = { time_mode: "opening" as const };
  const closing = { time_mode: "closing" as const };
  it("opening is the rundown's first underwriting-permitted marked break", () => {
    expect(isBreakPositionEligible(opening, "first", siblings)).toBe(true);
    expect(isBreakPositionEligible(opening, "middle", siblings)).toBe(false);
    expect(isBreakPositionEligible(opening, "last", siblings)).toBe(false);
  });
  it("closing is the last one, ignoring unmarked breaks and ones that permit no credit", () => {
    expect(isBreakPositionEligible(closing, "last", siblings)).toBe(true);
    expect(isBreakPositionEligible(closing, "middle", siblings)).toBe(false);
    expect(isBreakPositionEligible(closing, "first", siblings)).toBe(false);
  });
  it("a single marked break is both opening and closing; other modes never exclude", () => {
    const one = [siblings[1]!];
    expect(isBreakPositionEligible(opening, "first", one)).toBe(true);
    expect(isBreakPositionEligible(closing, "first", one)).toBe(true);
    expect(isBreakPositionEligible({ time_mode: "any" as const }, "middle", siblings)).toBe(true);
    expect(isBreakPositionEligible(opening, "missing", siblings)).toBe(false);
  });
});
