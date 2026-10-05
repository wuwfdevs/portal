import { describe, expect, it } from "vitest";
import {
  airTimeToMinutes,
  describeEntryDays,
  formatHourLabel,
  formatTimeRange,
  formatWeekRange,
  isValidDateISO,
  layoutDayBlocks,
  shadingBands,
  visibleHourRange,
  weekDates,
  weekStartISO,
} from "@/lib/log/week-layout";

describe("weekDates", () => {
  it("returns Monday through Sunday for any day of the week", () => {
    const expected = [
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ];
    expect(weekDates("2026-09-28")).toEqual(expected);
    expect(weekDates("2026-10-01")).toEqual(expected);
    expect(weekDates("2026-10-04")).toEqual(expected);
  });
  it("crosses a year boundary", () => {
    expect(weekStartISO("2027-01-01")).toBe("2026-12-28");
    expect(weekDates("2027-01-01")[6]).toBe("2027-01-03");
  });
});

describe("isValidDateISO", () => {
  it("accepts real dates only", () => {
    expect(isValidDateISO("2026-09-28")).toBe(true);
    expect(isValidDateISO("2026-02-30")).toBe(false);
    expect(isValidDateISO("nope")).toBe(false);
    expect(isValidDateISO(undefined)).toBe(false);
  });
});

describe("formatWeekRange", () => {
  it("shares the year within one year", () => {
    expect(formatWeekRange("2026-09-28")).toBe("Sep 28 – Oct 4, 2026");
  });
  it("shows both years across New Year", () => {
    expect(formatWeekRange("2026-12-28")).toBe("Dec 28, 2026 – Jan 3, 2027");
  });
});

describe("formatTimeRange", () => {
  it("collapses a shared period", () => {
    expect(formatTimeRange("07:00:00", 120)).toBe("7:00 – 9:00 AM");
  });
  it("keeps both periods when they differ", () => {
    expect(formatTimeRange("11:00:00", 120)).toBe("11:00 AM – 1:00 PM");
  });
});

describe("describeEntryDays", () => {
  it("pluralizes a single weekday", () => {
    expect(describeEntryDays({ entry_type: "recurring", days_of_week: [6] })).toBe("Saturdays");
  });
  it("uses a range otherwise", () => {
    expect(describeEntryDays({ entry_type: "recurring", days_of_week: [1, 2, 3, 4, 5] })).toBe(
      "Mon–Fri",
    );
    expect(describeEntryDays({ entry_type: "override", days_of_week: [] })).toBe("Override");
  });
});

describe("visibleHourRange", () => {
  it("defaults to 5 AM through midnight", () => {
    expect(visibleHourRange([{ startMinutes: 300 }, { startMinutes: 1200 }])).toEqual({
      startHour: 5,
      endHour: 24,
    });
    expect(visibleHourRange([])).toEqual({ startHour: 5, endHour: 24 });
  });
  it("widens for an early entry", () => {
    expect(visibleHourRange([{ startMinutes: airTimeToMinutes("03:30:00") }])).toEqual({
      startHour: 3,
      endHour: 24,
    });
  });
});

describe("layoutDayBlocks", () => {
  it("positions a block from the top of the range", () => {
    const [block] = layoutDayBlocks([{ id: "a", startMinutes: 420, durationMinutes: 120 }]);
    expect(block).toMatchObject({ topMinutes: 120, heightMinutes: 120, lane: 0, laneCount: 1 });
  });
  it("puts back-to-back blocks in the same lane", () => {
    const blocks = layoutDayBlocks([
      { id: "a", startMinutes: 300, durationMinutes: 60 },
      { id: "b", startMinutes: 360, durationMinutes: 60 },
    ]);
    expect(blocks.every((b) => b.lane === 0 && b.laneCount === 1)).toBe(true);
  });
  it("splits overlapping blocks into lanes", () => {
    const blocks = layoutDayBlocks([
      { id: "a", startMinutes: 600, durationMinutes: 120 },
      { id: "b", startMinutes: 630, durationMinutes: 60 },
      { id: "c", startMinutes: 900, durationMinutes: 60 },
    ]);
    const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
    expect(byId.a).toMatchObject({ lane: 0, laneCount: 2 });
    expect(byId.b).toMatchObject({ lane: 1, laneCount: 2 });
    expect(byId.c).toMatchObject({ lane: 0, laneCount: 1 });
  });
  it("clips at midnight rather than wrapping", () => {
    const [block] = layoutDayBlocks([
      { id: "a", startMinutes: 23 * 60 + 30, durationMinutes: 120 },
    ]);
    expect(block).toMatchObject({ topMinutes: 18 * 60 + 30, heightMinutes: 30, clipped: true });
  });
  it("drops an entry entirely outside the range", () => {
    expect(layoutDayBlocks([{ id: "a", startMinutes: 60, durationMinutes: 60 }])).toEqual([]);
  });
  it("honours a widened start hour", () => {
    const [block] = layoutDayBlocks([{ id: "a", startMinutes: 210, durationMinutes: 60 }], 3);
    expect(block).toMatchObject({ topMinutes: 30, heightMinutes: 60 });
  });
});

describe("formatHourLabel", () => {
  it("labels the gutter", () => {
    expect(formatHourLabel(5)).toBe("5 AM");
    expect(formatHourLabel(12)).toBe("12 PM");
    expect(formatHourLabel(24)).toBe("12 AM");
  });
});

describe("shadingBands", () => {
  it("clips covered runs to the visible range and skips what falls outside it", () => {
    const runs = [
      { fromSeconds: 0, toSeconds: 5 * 3600, covered: true }, // overnight tail, before 5 AM
      { fromSeconds: 5 * 3600, toSeconds: 17 * 3600, covered: true }, // the daytime window
      { fromSeconds: 17 * 3600, toSeconds: 20 * 3600, covered: false },
      { fromSeconds: 20 * 3600, toSeconds: 24 * 3600 + 1800, covered: true }, // past midnight
    ];
    expect(shadingBands(runs, "closed", 5, 24)).toEqual([
      { kind: "closed", topMinutes: 0, heightMinutes: 12 * 60 },
      { kind: "closed", topMinutes: 15 * 60, heightMinutes: 4 * 60 },
    ]);
    // A range starting earlier shows the overnight tail too.
    expect(shadingBands(runs, "automated", 3, 24)[0]).toEqual({
      kind: "automated",
      topMinutes: 0,
      heightMinutes: 2 * 60,
    });
  });
});
