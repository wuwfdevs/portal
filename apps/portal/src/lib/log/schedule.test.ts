import { describe, expect, it } from "vitest";
import {
  computeEndTime,
  entriesInForceOn,
  formatAirTime,
  isScheduleEntryActiveOn,
  resolveEntryInForce,
  type ScheduleEntryLike,
} from "./schedule";

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
    expect(isScheduleEntryActiveOn(entry({ days_of_week: [1, 2, 3, 5] }), "2026-08-06")).toBe(
      false,
    );
  });

  it("days_of_week gates an override entry too; none means every day in its dates", () => {
    // 2026-08-06 is a Thursday.
    expect(
      isScheduleEntryActiveOn(entry({ entry_type: "override", days_of_week: [1] }), "2026-08-06"),
    ).toBe(false);
    expect(
      isScheduleEntryActiveOn(entry({ entry_type: "override", days_of_week: [4] }), "2026-08-06"),
    ).toBe(true);
    expect(
      isScheduleEntryActiveOn(entry({ entry_type: "override", days_of_week: [] }), "2026-08-06"),
    ).toBe(true);
  });

  it("a day-limited override leaves the standing entry in force on its other days", () => {
    const normal = entry({ days_of_week: [6, 0] });
    const special = entry({ entry_type: "override", days_of_week: [6], start_date: "2026-08-01" });
    // 2026-08-08 Sat, 2026-08-09 Sun.
    expect(resolveEntryInForce([normal, special], "2026-08-08")).toBe(special);
    expect(resolveEntryInForce([normal, special], "2026-08-09")).toBe(normal);
  });
});

describe("resolveEntryInForce", () => {
  const normal = entry({ days_of_week: [0, 1, 2, 3, 4, 5, 6] });
  const storm = entry({ entry_type: "override", start_date: "2026-09-02", end_date: "2026-09-04" });

  it("returns null when nothing covers the date", () => {
    expect(resolveEntryInForce([entry({ start_date: "2026-10-01" })], "2026-09-01")).toBeNull();
  });

  it("lets a one-time change win over the recurring entry inside its dates", () => {
    expect(resolveEntryInForce([normal, storm], "2026-09-03")).toBe(storm);
    expect(resolveEntryInForce([storm, normal], "2026-09-03")).toBe(storm);
  });

  it("falls back to the recurring entry before the change starts", () => {
    expect(resolveEntryInForce([normal, storm], "2026-09-01")).toBe(normal);
  });

  it("falls back to the recurring entry the day after the change ends", () => {
    expect(resolveEntryInForce([normal, storm], "2026-09-05")).toBe(normal);
  });

  it("does not let a future-starting change win early", () => {
    const later = entry({ entry_type: "override", start_date: "2026-12-01" });
    expect(resolveEntryInForce([normal, later], "2026-09-03")).toBe(normal);
  });

  it("between two one-time changes, the later start date wins", () => {
    const wide = entry({
      entry_type: "override",
      start_date: "2026-09-01",
      end_date: "2026-09-30",
    });
    expect(resolveEntryInForce([wide, storm], "2026-09-03")).toBe(storm);
  });

  it("between two recurring entries, the later start date wins", () => {
    const older = entry({ start_date: "2026-01-01" });
    const newer = entry({ start_date: "2026-06-01" });
    expect(resolveEntryInForce([older, newer], "2026-09-03")).toBe(newer);
  });

  it("keeps the earlier entry on a complete tie", () => {
    const a = entry();
    const b = entry();
    expect(resolveEntryInForce([a, b], "2026-09-03")).toBe(a);
  });
});

describe("entriesInForceOn", () => {
  it("returns one entry per program, keeping the input order", () => {
    const withProgram = (program_id: string, o: Partial<ScheduleEntryLike> = {}) => ({
      ...entry(o),
      program_id,
    });
    const atcNormal = withProgram("atc");
    const atcStorm = withProgram("atc", { entry_type: "override", start_date: "2026-09-02" });
    const me = withProgram("me");
    expect(entriesInForceOn([atcNormal, me, atcStorm], "2026-09-03")).toEqual([me, atcStorm]);
    expect(entriesInForceOn([atcNormal, me, atcStorm], "2026-09-01")).toEqual([atcNormal, me]);
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
