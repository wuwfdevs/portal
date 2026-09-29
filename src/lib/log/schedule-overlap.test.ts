import { describe, expect, it } from "vitest";
import {
  findScheduleOverlaps,
  type OverlapCandidate,
  type OverlapOther,
} from "@/lib/log/schedule-overlap";

const base: OverlapCandidate = {
  entry_type: "recurring",
  days_of_week: [6],
  start_date: "2026-01-01",
  end_date: null,
  air_time: "07:00",
  duration_minutes: 120,
};

function other(overrides: Partial<OverlapOther> = {}): OverlapOther {
  return { ...base, id: "o1", programName: "Other Show", ...overrides };
}

describe("findScheduleOverlaps", () => {
  it("reports a same-day, overlapping time range", () => {
    const result = findScheduleOverlaps(base, [other({ air_time: "08:00:00" })]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      entryId: "o1",
      programName: "Other Show",
      days: [6],
      airTime: "08:00:00",
      durationMinutes: 120,
    });
  });

  it("ignores a different weekday", () => {
    expect(findScheduleOverlaps(base, [other({ days_of_week: [0] })])).toEqual([]);
  });

  it("does not count touching entries as a conflict", () => {
    expect(findScheduleOverlaps(base, [other({ air_time: "09:00" })])).toEqual([]);
    expect(findScheduleOverlaps(base, [other({ air_time: "05:00" })])).toEqual([]);
  });

  it("treats an empty days list on a recurring entry as every day", () => {
    const result = findScheduleOverlaps(base, [other({ days_of_week: [] })]);
    expect(result[0]?.days).toEqual([6]);
    const everyDay = findScheduleOverlaps({ ...base, days_of_week: [] }, [
      other({ days_of_week: [2, 6] }),
    ]);
    expect(everyDay[0]?.days).toEqual([2, 6]);
  });

  it("treats override and holiday entries as covering every day in range", () => {
    const result = findScheduleOverlaps(base, [
      other({ entry_type: "holiday", days_of_week: [1] }),
    ]);
    expect(result[0]?.days).toEqual([6]);
  });

  it("ignores non-overlapping date ranges, and open-ended ones overlap", () => {
    expect(
      findScheduleOverlaps(base, [other({ start_date: "2025-01-01", end_date: "2025-12-31" })]),
    ).toEqual([]);
    expect(
      findScheduleOverlaps({ ...base, end_date: "2026-03-01" }, [
        other({ start_date: "2026-03-02" }),
      ]),
    ).toEqual([]);
    expect(findScheduleOverlaps(base, [other({ start_date: "2030-01-01" })])).toHaveLength(1);
    expect(
      findScheduleOverlaps(base, [other({ start_date: "2026-03-01", end_date: "2026-03-01" })]),
    ).toHaveLength(1);
  });

  it("handles an entry running past midnight into the next day", () => {
    const late = other({ days_of_week: [5], air_time: "23:00", duration_minutes: 180 });
    // Friday 23:00-02:00 collides with Saturday 01:00-03:00.
    const result = findScheduleOverlaps({ ...base, air_time: "01:00", duration_minutes: 120 }, [
      late,
    ]);
    expect(result[0]?.days).toEqual([6]);
    // ...but not with Saturday 02:00 onward.
    expect(findScheduleOverlaps({ ...base, air_time: "02:00" }, [late])).toEqual([]);
  });

  it("handles a candidate running past midnight, including Saturday into Sunday and the week wrap", () => {
    const candidate = { ...base, days_of_week: [0], air_time: "23:00", duration_minutes: 120 };
    const monday = other({ days_of_week: [1], air_time: "00:30", duration_minutes: 30 });
    expect(findScheduleOverlaps(candidate, [monday])[0]?.days).toEqual([0]);
    const sat = other({ days_of_week: [6], air_time: "23:00", duration_minutes: 120 });
    expect(
      findScheduleOverlaps(
        { ...base, days_of_week: [0], air_time: "00:30", duration_minutes: 30 },
        [sat],
      )[0]?.days,
    ).toEqual([0]);
  });

  it("excludes the candidate's own row by id", () => {
    expect(findScheduleOverlaps({ ...base, id: "o1" }, [other()])).toEqual([]);
    expect(findScheduleOverlaps({ ...base, id: "x" }, [other()])).toHaveLength(1);
  });

  it("returns nothing for a zero-length candidate", () => {
    expect(findScheduleOverlaps({ ...base, duration_minutes: 0 }, [other()])).toEqual([]);
  });
});
