import { describe, expect, it } from "vitest";
import { stationLocalToUTC } from "./automated-hours";
import {
  closedHoursOnDay,
  closedSegments,
  isClosedToUnderwriting,
  type ClosedWeeklyWindow,
  type UnderwritingHourChange,
} from "./underwriting-hours";

const at = (date: string, time: string) => stationLocalToUTC(date, time);

/** WUWF's first rule: closed 5 AM – 5 PM every day. */
function weekly(overrides: Partial<ClosedWeeklyWindow> = {}): ClosedWeeklyWindow {
  return {
    id: "w1",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startTime: "05:00:00",
    endTime: "17:00:00",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    active: true,
    ...overrides,
  };
}

function change(overrides: Partial<UnderwritingHourChange> = {}): UnderwritingHourChange {
  return {
    id: "c1",
    startsAt: at("2026-10-05", "00:00:00"),
    endsAt: at("2026-10-12", "00:00:00"),
    mode: "closed",
    active: true,
    ...overrides,
  };
}

describe("isClosedToUnderwriting", () => {
  it("is open when nothing is recorded", () => {
    expect(isClosedToUnderwriting(at("2026-10-06", "09:00:00"), [], [])).toBe(false);
  });

  it("closes the daytime window and leaves the evening open", () => {
    const windows = [weekly()];
    expect(isClosedToUnderwriting(at("2026-10-06", "05:00:00"), windows, [])).toBe(true);
    expect(isClosedToUnderwriting(at("2026-10-06", "07:49:00"), windows, [])).toBe(true);
    expect(isClosedToUnderwriting(at("2026-10-06", "16:59:59"), windows, [])).toBe(true);
    expect(isClosedToUnderwriting(at("2026-10-06", "17:00:00"), windows, [])).toBe(false);
    expect(isClosedToUnderwriting(at("2026-10-06", "04:59:00"), windows, [])).toBe(false);
  });

  it("gives the after-midnight part of an overnight window to the day it started", () => {
    // Saturday only, 8 PM – 5 AM: early Sunday is closed, early Saturday is not.
    const windows = [weekly({ daysOfWeek: [6], startTime: "20:00:00", endTime: "05:00:00" })];
    expect(isClosedToUnderwriting(at("2026-10-11", "02:00:00"), windows, [])).toBe(true);
    expect(isClosedToUnderwriting(at("2026-10-10", "02:00:00"), windows, [])).toBe(false);
    expect(isClosedToUnderwriting(at("2026-10-10", "21:00:00"), windows, [])).toBe(true);
  });

  it("respects a window's effective dates and active flag", () => {
    expect(
      isClosedToUnderwriting(
        at("2026-10-06", "09:00:00"),
        [weekly({ effectiveFrom: "2026-10-07" })],
        [],
      ),
    ).toBe(false);
    expect(
      isClosedToUnderwriting(
        at("2026-10-06", "09:00:00"),
        [weekly({ effectiveTo: "2026-10-05" })],
        [],
      ),
    ).toBe(false);
    expect(
      isClosedToUnderwriting(at("2026-10-06", "09:00:00"), [weekly({ active: false })], []),
    ).toBe(false);
  });

  it("lets a one-time change win in either direction", () => {
    const windows = [weekly()];
    // Pledge week closes the evening too.
    expect(isClosedToUnderwriting(at("2026-10-07", "19:00:00"), windows, [change()])).toBe(true);
    // An opening inside the daytime window: a special broadcast.
    const open = change({
      startsAt: at("2026-10-20", "09:00:00"),
      endsAt: at("2026-10-20", "11:00:00"),
      mode: "open",
    });
    expect(isClosedToUnderwriting(at("2026-10-20", "10:00:00"), windows, [open])).toBe(false);
    expect(isClosedToUnderwriting(at("2026-10-20", "11:00:00"), windows, [open])).toBe(true);
    // An inactive change is as if it were never made.
    expect(
      isClosedToUnderwriting(at("2026-10-20", "10:00:00"), windows, [{ ...open, active: false }]),
    ).toBe(true);
  });

  it("counts the union of overlapping weekly windows", () => {
    const windows = [
      weekly({ id: "a", startTime: "05:00:00", endTime: "12:00:00" }),
      weekly({ id: "b", startTime: "11:00:00", endTime: "17:00:00" }),
    ];
    expect(isClosedToUnderwriting(at("2026-10-06", "11:30:00"), windows, [])).toBe(true);
    expect(isClosedToUnderwriting(at("2026-10-06", "16:30:00"), windows, [])).toBe(true);
  });
});

describe("closedSegments", () => {
  it("cuts a day into runs, labeled by what decided them", () => {
    const open = change({
      startsAt: at("2026-10-06", "09:00:00"),
      endsAt: at("2026-10-06", "11:00:00"),
      mode: "open",
    });
    const segments = closedSegments("2026-10-06", [weekly()], [open]);
    expect(segments.map((s) => [s.closed, s.source])).toEqual([
      [false, "default"],
      [true, "weekly"],
      [false, "once"],
      [true, "weekly"],
      [false, "default"],
    ]);
    expect(segments[1]!.startsAt).toBe(at("2026-10-06", "05:00:00"));
    expect(segments[2]!.startsAt).toBe(at("2026-10-06", "09:00:00"));
    expect(segments[2]!.changeId).toBe("c1");
    expect(segments[4]!.startsAt).toBe(at("2026-10-06", "17:00:00"));
  });

  it("totals a day's closed hours, on the fall-back day too", () => {
    expect(closedHoursOnDay("2026-10-06", [weekly()], [])).toBe(12);
    // 2026-11-01 has 25 hours; a 5 AM – 5 PM window is still 12 of them.
    expect(closedHoursOnDay("2026-11-01", [weekly()], [])).toBe(12);
    // A whole pledge week closed: 24 hours on a day inside it.
    expect(closedHoursOnDay("2026-10-07", [weekly()], [change()])).toBe(24);
  });
});
