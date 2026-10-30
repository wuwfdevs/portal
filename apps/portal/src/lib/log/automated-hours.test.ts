import { describe, expect, it } from "vitest";
import {
  automatedHoursOnDay,
  automatedSegments,
  isAutomated,
  stationLocalParts,
  type OnAirChange,
  stationLocalToUTC,
  type WeeklyAutomatedWindow,
} from "./automated-hours";

const at = (date: string, time: string) => stationLocalToUTC(date, time);

function weekly(overrides: Partial<WeeklyAutomatedWindow> = {}): WeeklyAutomatedWindow {
  return {
    id: "w1",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startTime: "20:00:00",
    endTime: "05:00:00",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    active: true,
    ...overrides,
  };
}

function change(overrides: Partial<OnAirChange> = {}): OnAirChange {
  return {
    id: "c1",
    startsAt: at("2026-10-02", "05:00:00"),
    endsAt: at("2026-10-02", "09:00:00"),
    mode: "automated",
    active: true,
    ...overrides,
  };
}

describe("stationLocalParts", () => {
  it("reads Central time, not UTC", () => {
    // 2026-10-02 01:30 UTC is still Oct 1, 8:30 PM in Pensacola (CDT).
    expect(stationLocalParts("2026-10-02T01:30:00Z")).toEqual({
      dateISO: "2026-10-01",
      dayOfWeek: 4,
      seconds: 20 * 3600 + 30 * 60,
    });
  });
});

describe("stationLocalToUTC", () => {
  it("uses the offset in force at the local time on a changeover day", () => {
    // Fall back 2026-11-01 at 2 AM: midnight is CDT, 5 AM is CST.
    expect(stationLocalToUTC("2026-11-01", "00:00:00")).toBe("2026-11-01T05:00:00.000Z");
    expect(stationLocalToUTC("2026-11-01", "05:00:00")).toBe("2026-11-01T11:00:00.000Z");
  });
});

describe("isAutomated", () => {
  it("is hosted when nothing is recorded", () => {
    expect(isAutomated(at("2026-10-01", "22:00:00"), [], [])).toBe(false);
  });

  it("covers both sides of midnight for an overnight window", () => {
    const windows = [weekly()];
    expect(isAutomated(at("2026-10-01", "21:00:00"), windows, [])).toBe(true);
    expect(isAutomated(at("2026-10-02", "04:59:00"), windows, [])).toBe(true);
    expect(isAutomated(at("2026-10-02", "05:00:00"), windows, [])).toBe(false);
    expect(isAutomated(at("2026-10-02", "12:00:00"), windows, [])).toBe(false);
  });

  it("gives the after-midnight part to the day the window started", () => {
    // Saturday only: Sunday 2 AM is automated, Saturday 2 AM is not.
    const windows = [weekly({ daysOfWeek: [6] })];
    expect(isAutomated(at("2026-10-04", "02:00:00"), windows, [])).toBe(true);
    expect(isAutomated(at("2026-10-03", "02:00:00"), windows, [])).toBe(false);
  });

  it("respects a window's effective dates and active flag", () => {
    expect(
      isAutomated(at("2026-10-01", "21:00:00"), [weekly({ effectiveFrom: "2026-10-02" })], []),
    ).toBe(false);
    expect(isAutomated(at("2026-10-01", "21:00:00"), [weekly({ active: false })], [])).toBe(false);
  });

  it("lets a one-time change win in either direction", () => {
    const windows = [weekly()];
    // Automated once, outside any weekly window: a host out in the morning.
    expect(isAutomated(at("2026-10-02", "06:00:00"), windows, [change()])).toBe(true);
    // Live once, inside the overnight window: an election night.
    const live = change({
      startsAt: at("2026-11-03", "20:00:00"),
      endsAt: at("2026-11-04", "01:00:00"),
      mode: "live",
    });
    expect(isAutomated(at("2026-11-03", "22:00:00"), windows, [live])).toBe(false);
    expect(isAutomated(at("2026-11-04", "02:00:00"), windows, [live])).toBe(true);
  });

  it("counts the union of overlapping weekly windows", () => {
    const windows = [
      weekly({ id: "a", startTime: "13:00:00", endTime: "15:00:00" }),
      weekly({ id: "b", startTime: "14:00:00", endTime: "17:00:00" }),
    ];
    expect(isAutomated(at("2026-10-03", "16:30:00"), windows, [])).toBe(true);
  });
});

describe("automatedSegments", () => {
  it("cuts a day into runs, labeled by what decided them", () => {
    const segments = automatedSegments("2026-10-02", [weekly()], [change()]);
    expect(segments.map((s) => [s.automated, s.source])).toEqual([
      [true, "weekly"],
      [true, "once"],
      [false, "default"],
      [true, "weekly"],
    ]);
    expect(segments[0]!.startsAt).toBe(at("2026-10-02", "00:00:00"));
    expect(segments[1]!.startsAt).toBe(at("2026-10-02", "05:00:00"));
    expect(segments[3]!.startsAt).toBe(at("2026-10-02", "20:00:00"));
  });

  it("handles the fall-back day (25 hours)", () => {
    // 2026-11-01: clocks fall back at 2 AM Central.
    expect(automatedHoursOnDay("2026-11-01", [weekly()], [])).toBe(10);
  });

  it("totals a normal day's automated hours", () => {
    expect(automatedHoursOnDay("2026-10-01", [weekly()], [])).toBe(9);
    expect(automatedHoursOnDay("2026-10-02", [weekly()], [change()])).toBe(13);
  });
});
