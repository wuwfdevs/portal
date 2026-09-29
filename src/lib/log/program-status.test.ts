import { describe, expect, it } from "vitest";
import {
  buildWeekStrip,
  deriveProgramStatus,
  formatDateShort,
  formatDaysOfWeek,
  formatDurationMinutes,
  isPlaceholderClockName,
  nextAiringDate,
  PLACEHOLDER_CLOCK_NAME,
} from "./program-status";

const REAL = "Morning Edition (weekday)";

describe("deriveProgramStatus", () => {
  const today = "2026-09-29";
  it("is not scheduled with no entries", () => {
    expect(deriveProgramStatus([], today)).toBe("not_scheduled");
  });
  it("ignores entries that have already ended", () => {
    expect(
      deriveProgramStatus(
        [{ clockTemplateName: REAL, start_date: "2026-01-01", end_date: "2026-06-30" }],
        today,
      ),
    ).toBe("not_scheduled");
  });
  it("counts an entry that starts later", () => {
    expect(
      deriveProgramStatus(
        [{ clockTemplateName: REAL, start_date: "2026-11-01", end_date: null }],
        today,
      ),
    ).toBe("on_real_clock");
  });
  it("needs a clock when any live entry is on the placeholder", () => {
    expect(
      deriveProgramStatus(
        [
          { clockTemplateName: REAL, start_date: "2026-01-01", end_date: null },
          { clockTemplateName: PLACEHOLDER_CLOCK_NAME, start_date: "2026-01-01", end_date: null },
        ],
        today,
      ),
    ).toBe("needs_clock");
  });
  it("ignores an ended placeholder entry", () => {
    expect(
      deriveProgramStatus(
        [
          { clockTemplateName: REAL, start_date: "2026-01-01", end_date: null },
          {
            clockTemplateName: PLACEHOLDER_CLOCK_NAME,
            start_date: "2025-01-01",
            end_date: "2025-12-31",
          },
        ],
        today,
      ),
    ).toBe("on_real_clock");
  });
});

describe("isPlaceholderClockName", () => {
  it("matches the seeded name regardless of case and padding", () => {
    expect(isPlaceholderClockName("  unspecified (awaiting network clock) ")).toBe(true);
    expect(isPlaceholderClockName("Morning Edition (weekday)")).toBe(false);
  });
});

describe("formatDaysOfWeek", () => {
  it("collapses contiguous runs and lists the rest", () => {
    expect(formatDaysOfWeek([1, 2, 3, 4, 5])).toBe("Mon–Fri");
    expect(formatDaysOfWeek([6])).toBe("Sat");
    expect(formatDaysOfWeek([1, 3, 5])).toBe("Mon, Wed, Fri");
    expect(formatDaysOfWeek([6, 0])).toBe("Sun, Sat");
    expect(formatDaysOfWeek([])).toBe("Every day");
    expect(formatDaysOfWeek([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
  });
});

describe("formatDurationMinutes", () => {
  it("formats hours and minutes", () => {
    expect(formatDurationMinutes(240)).toBe("4 h");
    expect(formatDurationMinutes(90)).toBe("1 h 30 min");
    expect(formatDurationMinutes(45)).toBe("45 min");
  });
});

describe("nextAiringDate", () => {
  const saturday = {
    entry_type: "recurring" as const,
    days_of_week: [6],
    start_date: "2026-01-03",
    end_date: null,
  };
  it("finds the first matching day, today included", () => {
    expect(nextAiringDate(saturday, "2026-09-29")).toBe("2026-10-03");
    expect(nextAiringDate(saturday, "2026-10-03")).toBe("2026-10-03");
  });
  it("waits for a start date in the future", () => {
    expect(nextAiringDate({ ...saturday, start_date: "2026-11-01" }, "2026-09-29")).toBe(
      "2026-11-07",
    );
  });
  it("returns null once the entry has ended", () => {
    expect(nextAiringDate({ ...saturday, end_date: "2026-06-30" }, "2026-09-29")).toBeNull();
  });
});

describe("buildWeekStrip", () => {
  it("runs Monday to Sunday and places air times on their days", () => {
    const week = buildWeekStrip(
      [
        {
          entry_type: "recurring",
          days_of_week: [6, 0],
          start_date: "2026-01-03",
          end_date: null,
          air_time: "07:00:00",
        },
      ],
      "2026-09-29",
    );
    expect(week.map((day) => day.dateISO)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(week.map((day) => day.airTimes.length)).toEqual([0, 0, 0, 0, 0, 1, 1]);
  });
  it("treats a Sunday as the end of its week", () => {
    const week = buildWeekStrip([], "2026-10-04");
    expect(week[0]?.dateISO).toBe("2026-09-28");
    expect(week[6]?.dateISO).toBe("2026-10-04");
  });
});

describe("formatDateShort", () => {
  it("formats a calendar date without shifting it", () => {
    expect(formatDateShort("2026-09-08")).toBe("Sep 8, 2026");
    expect(formatDateShort("2026-10-03", true)).toBe("Sat, Oct 3");
  });
});
