import { describe, expect, it } from "vitest";
import {
  DEFAULT_WINDOWS,
  capacitySummary,
  checkBooking,
  formatHours,
  leadHoursOn,
  monthShareWarning,
  monthlyCapacity,
  nextOpenWindows,
  parseWindows,
  tentativeExpiry,
  type BookingLike,
  type CalendarState,
  type HoldLike,
} from "./scheduling";

// The workbook's placeholders (docs/bookings-design.md §2.1): 100 days =
// 800 hours a term, a 15% reserve = 120 hours.
const PLAN = {
  starts_on: "2027-01-11",
  ends_on: "2027-05-07",
  net_professional_hours: 800,
  reserve_share: 0.15,
  lead_hours_per_day: 8,
};

const NOW = "2027-01-04T15:00:00.000Z";

function booking(overrides: Partial<BookingLike> & { id: string }): BookingLike {
  return {
    pool: "studio",
    date: "2027-02-01",
    window_start: "08:00",
    window_end: "12:00",
    professional_hours: 4,
    treatment: "incremental",
    status: "confirmed",
    expires_at: null,
    label: "A booking",
    ...overrides,
  };
}

function hold(overrides: Partial<HoldLike> & { id: string }): HoldLike {
  return {
    pool: "studio",
    date: "2027-02-01",
    window_start: "08:00",
    window_end: "12:00",
    professional_hours: 4,
    kind: "core",
    label: "Pledge drive",
    ...overrides,
  };
}

function state(overrides: Partial<CalendarState> = {}): CalendarState {
  return {
    plan: PLAN,
    resources: [
      {
        pool: "studio",
        available_units: 60,
        unit_label: "half-days",
        windows: DEFAULT_WINDOWS.studio,
      },
      { pool: "edit", available_units: 200, unit_label: "hours", windows: DEFAULT_WINDOWS.edit },
    ],
    blackouts: [],
    holds: [],
    bookings: [],
    nowISO: NOW,
    ...overrides,
  };
}

const REQUEST = {
  pool: "studio" as const,
  date: "2027-02-01",
  window_start: "08:00",
  window_end: "12:00",
  professional_hours: 5,
  treatment: "incremental" as const,
};

describe("capacitySummary", () => {
  it("reproduces the framework's envelope at the placeholders", () => {
    const summary = capacitySummary(PLAN, [], [], NOW);
    expect(summary.net).toBe(800);
    expect(summary.reserve).toBe(120);
    expect(summary.open).toBe(680);
    expect(summary.reserveRemaining).toBe(120);
  });

  it("draws strategic bookings from the reserve and the rest from open capacity, holds from open", () => {
    const summary = capacitySummary(
      PLAN,
      [hold({ id: "h1", professional_hours: 8 })],
      [
        booking({ id: "s", treatment: "strategic", professional_hours: 30 }),
        booking({ id: "i", treatment: "incremental", professional_hours: 10 }),
        booking({ id: "x", treatment: "external", professional_hours: 5 }),
        booking({ id: "r", status: "released", professional_hours: 100 }),
        booking({
          id: "t",
          status: "tentative",
          expires_at: "2027-01-01T00:00:00.000Z",
          professional_hours: 100,
        }),
      ],
      NOW,
    );
    expect(summary.strategicBooked).toBe(30);
    expect(summary.reserveRemaining).toBe(90);
    expect(summary.nonStrategicBooked).toBe(15);
    expect(summary.held).toBe(8);
    expect(summary.open).toBe(800 - 120 - 8 - 15);
    expect(summary.booked).toBe(45);
  });

  it("counts an unexpired tentative hold as taken", () => {
    const summary = capacitySummary(
      PLAN,
      [],
      [booking({ id: "t", status: "tentative", expires_at: "2027-01-18T15:00:00.000Z" })],
      NOW,
    );
    expect(summary.nonStrategicBooked).toBe(4);
  });
});

describe("checkBooking", () => {
  it("allows an open window with no warning", () => {
    expect(checkBooking(REQUEST, state())).toEqual({ ok: true, warnings: [] });
  });

  it("refuses a date outside the plan and a pool the plan has no resource for", () => {
    const outside = checkBooking({ ...REQUEST, date: "2027-06-01" }, state());
    expect(outside.ok).toBe(false);
    if (!outside.ok) expect(outside.refusal.reason).toBe("outside_plan");
    const noResource = checkBooking({ ...REQUEST, pool: "field" }, state());
    expect(noResource.ok).toBe(false);
    if (!noResource.ok) expect(noResource.refusal.reason).toBe("no_resource");
  });

  it("step 1: a blackout on the pool, or on every pool, refuses and names its reason", () => {
    const blackout = {
      id: "b",
      starts_on: "2027-01-30",
      ends_on: "2027-02-02",
      pools: null,
      reason: "Spring pledge drive",
    };
    const result = checkBooking(REQUEST, state({ blackouts: [blackout] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.reason).toBe("blacked_out");
      expect(result.refusal.message).toContain("Spring pledge drive");
      // The nearest open date on the same resource, after the blackout.
      expect(result.alternatives[0]).toMatchObject({ date: "2027-02-03" });
    }
    const otherPool = checkBooking(
      REQUEST,
      state({ blackouts: [{ ...blackout, pools: ["edit"] }] }),
    );
    expect(otherPool.ok).toBe(true);
  });

  it("step 1: a core hold overlapping the window refuses", () => {
    const result = checkBooking(
      REQUEST,
      state({ holds: [hold({ id: "h", window_start: "10:00", window_end: "14:00" })] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.reason).toBe("held");
  });

  it("step 3: a confirmed or live tentative booking takes the window; an expired or released one does not", () => {
    const taken = checkBooking(
      REQUEST,
      state({
        bookings: [
          booking({
            id: "t",
            status: "tentative",
            expires_at: "2027-01-18T00:00:00Z",
            professional_hours: 2,
          }),
        ],
      }),
    );
    expect(taken.ok).toBe(false);
    if (!taken.ok) {
      expect(taken.refusal.reason).toBe("window_taken");
      // The same day's other windows come first.
      expect(taken.alternatives[0]).toMatchObject({ date: "2027-02-01", window_start: "13:00" });
    }
    const free = checkBooking(
      REQUEST,
      state({
        bookings: [
          booking({ id: "e", status: "tentative", expires_at: "2027-01-01T00:00:00Z" }),
          booking({ id: "r", status: "released" }),
        ],
      }),
    );
    expect(free.ok).toBe(true);
  });

  it("step 3: moving a booking never collides with itself", () => {
    const result = checkBooking(
      { ...REQUEST, excludeBookingId: "me" },
      state({ bookings: [booking({ id: "me" })] }),
    );
    expect(result.ok).toBe(true);
  });

  it("step 4: the lead's day holds 8 hours across bookings and holds", () => {
    const full = checkBooking(
      REQUEST,
      state({
        holds: [
          hold({
            id: "h",
            pool: null,
            window_start: "06:00",
            window_end: "07:00",
            professional_hours: 2,
          }),
        ],
        bookings: [
          booking({ id: "pm", window_start: "13:00", window_end: "17:00", professional_hours: 2 }),
        ],
      }),
    );
    expect(full.ok).toBe(false);
    if (!full.ok) {
      expect(full.refusal.reason).toBe("lead_day_full");
      expect(full.refusal).toMatchObject({ remaining: 4 });
    }
    expect(
      leadHoursOn(
        "2027-02-01",
        [hold({ id: "h", professional_hours: 2 })],
        [booking({ id: "b", professional_hours: 2 })],
        NOW,
      ),
    ).toBe(4);
  });

  it("step 5: a strategic booking draws the reserve, not open capacity", () => {
    const nearlyFull = state({
      bookings: [
        booking({ id: "s", treatment: "strategic", professional_hours: 118, date: "2027-03-01" }),
      ],
    });
    const refused = checkBooking({ ...REQUEST, treatment: "strategic" }, nearlyFull);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.refusal.reason).toBe("reserve_exhausted");
      expect(refused.refusal).toMatchObject({ remaining: 2 });
      expect(refused.alternatives).toEqual([]);
    }
    // Open capacity is untouched by the reserve's draw.
    expect(checkBooking(REQUEST, nearlyFull).ok).toBe(true);
  });

  it("step 5: incremental and external bookings draw open capacity, which holds reduce", () => {
    const tight = state({
      holds: [hold({ id: "h", date: "2027-03-01", professional_hours: 600 })],
      bookings: [
        booking({ id: "x", treatment: "external", professional_hours: 76, date: "2027-03-02" }),
      ],
    });
    // open = 800 − 120 − 600 − 76 = 4
    const refused = checkBooking(REQUEST, tight);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.refusal.reason).toBe("open_capacity_exhausted");
      expect(refused.refusal).toMatchObject({ remaining: 4 });
    }
    expect(checkBooking({ ...REQUEST, professional_hours: 4 }, tight).ok).toBe(true);
  });

  it("warns, never blocks, when a booking takes more than half a month's remaining open capacity", () => {
    // 117 term days; February has 28 → open share 680 × 28 / 117 ≈ 162.74 h.
    // With 150 h already booked in February, ~12.74 h remain; 7 h is more than half.
    const sold = state({
      bookings: Array.from({ length: 19 }, (_, i) =>
        booking({
          id: `feb-${i}`,
          date: `2027-02-${String(2 + i).padStart(2, "0")}`,
          professional_hours: i === 18 ? 6 : 8,
          window_start: "08:00",
          window_end: "17:00",
        }),
      ),
    });
    const result = checkBooking({ ...REQUEST, professional_hours: 7 }, sold);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("February 2027");
    }
    expect(monthShareWarning({ ...REQUEST, professional_hours: 5 }, sold)).toBeNull();
    expect(monthShareWarning({ ...REQUEST, professional_hours: 7 }, state())).toBeNull();
    expect(
      monthShareWarning({ ...REQUEST, treatment: "strategic", professional_hours: 7 }, sold),
    ).toBeNull();
  });
});

describe("nextOpenWindows", () => {
  it("searches the asked day's other windows, then outward by day, within the plan", () => {
    const alternatives = nextOpenWindows(
      { ...REQUEST, date: "2027-01-11", professional_hours: 4 },
      state({
        bookings: [
          booking({
            id: "a",
            date: "2027-01-11",
            window_start: "08:00",
            window_end: "12:00",
            professional_hours: 2,
          }),
          booking({
            id: "b",
            date: "2027-01-11",
            window_start: "13:00",
            window_end: "17:00",
            professional_hours: 2,
          }),
        ],
      }),
      2,
    );
    // On the 11th the full day overlaps both bookings and the evening is free
    // (2 + 2 + 4 hours fit the lead's day); nothing before the 11th is inside
    // the plan, so the 12th comes next.
    expect(alternatives).toEqual([
      { date: "2027-01-11", window_start: "17:00", window_end: "21:00", label: "Evening" },
      { date: "2027-01-12", window_start: "08:00", window_end: "12:00", label: "Morning" },
    ]);
  });
});

describe("monthlyCapacity", () => {
  it("spreads open capacity by the term's days in each month and nets off that month's bookings", () => {
    const months = monthlyCapacity(
      state({ bookings: [booking({ id: "feb", professional_hours: 20, date: "2027-02-10" })] }),
    );
    expect(months.map((m) => m.month)).toEqual([
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
    ]);
    const total = months.reduce((sum, m) => sum + m.openShare, 0);
    expect(Math.abs(total - 680)).toBeLessThan(0.1);
    const february = months.find((m) => m.month === "2027-02");
    expect(february).toMatchObject({ days: 28, nonStrategicBooked: 20 });
    expect(february!.openRemaining).toBeCloseTo(february!.openShare - 20, 2);
  });
});

describe("windows and formatting", () => {
  it("parses the windows column and drops malformed entries", () => {
    expect(
      parseWindows([
        { key: "am", label: "Morning", start: "08:00", end: "12:00" },
        { key: "bad", label: "Backwards", start: "12:00", end: "08:00" },
        { key: "x", label: 3, start: "08:00", end: "09:00" },
        "nonsense",
      ]),
    ).toEqual([{ key: "am", label: "Morning", start: "08:00", end: "12:00" }]);
    expect(parseWindows(null)).toEqual([]);
  });

  it("formats hours as days once there is a day of them", () => {
    expect(formatHours(5)).toBe("5 h");
    expect(formatHours(8)).toBe("1 day (8 h)");
    expect(formatHours(120)).toBe("15 days (120 h)");
    expect(formatHours(12)).toBe("1.5 days (12 h)");
  });

  it("gives a tentative hold the 14-day expiry", () => {
    expect(tentativeExpiry("2027-01-04T15:00:00.000Z")).toBe("2027-01-18T15:00:00.000Z");
  });
});

describe("parseWindowLines", () => {
  it("round-trips the resource form's lines", async () => {
    const { parseWindowLines, formatWindowLines } = await import("./scheduling");
    const parsed = parseWindowLines("Morning 08:00–12:00\nAfternoon 13:00-17:00\n\n");
    expect(parsed).toEqual({
      ok: true,
      windows: [
        { key: "morning", label: "Morning", start: "08:00", end: "12:00" },
        { key: "afternoon", label: "Afternoon", start: "13:00", end: "17:00" },
      ],
    });
    if (parsed.ok)
      expect(formatWindowLines(parsed.windows)).toBe("Morning 08:00–12:00\nAfternoon 13:00–17:00");
    expect(parseWindowLines("Morning 12:00–08:00").ok).toBe(false);
    expect(parseWindowLines("whenever").ok).toBe(false);
  });
});
