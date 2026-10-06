import { describe, expect, it } from "vitest";
import {
  FALLBACK_WINDOWS,
  capacitySummary,
  checkBooking,
  classHoursOn,
  formatHours,
  formatWindowLines,
  hoursByClass,
  monthShareWarning,
  monthlyCapacity,
  nextOpenWindows,
  parseWindowLines,
  parseWindows,
  tentativeExpiry,
  totalCapacity,
  type BookingLike,
  type CalendarState,
  type HoldLike,
} from "./scheduling";

// The workbook's placeholders (docs/bookings-design.md §2.1): 100 days =
// 800 hours a term for the production lead, a 15% reserve = 120 hours. A
// second class, the engineer, has two people and no reserve draw yet.
const PLAN = { starts_on: "2027-01-11", ends_on: "2027-05-07", reserve_share: 0.15 };
const LEAD = "lead";
const ENGINEER = "engineer";
const STUDENT = "student";
const STUDIO = "studio";
const EDIT = "edit";
const NOW = "2027-01-04T15:00:00.000Z";

function booking(overrides: Partial<BookingLike> & { id: string }): BookingLike {
  return {
    pool_id: STUDIO,
    date: "2027-02-01",
    window_start: "08:00",
    window_end: "12:00",
    treatment: "incremental",
    status: "confirmed",
    expires_at: null,
    label: "A booking",
    hours: { [LEAD]: 4 },
    ...overrides,
  };
}

function hold(overrides: Partial<HoldLike> & { id: string }): HoldLike {
  return {
    pool_id: STUDIO,
    date: "2027-02-01",
    window_start: "08:00",
    window_end: "12:00",
    kind: "core",
    label: "Pledge drive",
    hours: { [LEAD]: 4 },
    ...overrides,
  };
}

function state(overrides: Partial<CalendarState> = {}): CalendarState {
  return {
    plan: PLAN,
    capacity: [
      { labor_class_id: LEAD, net_hours: 800, headcount: 1, hours_per_person_day: 8 },
      { labor_class_id: ENGINEER, net_hours: 400, headcount: 2, hours_per_person_day: 8 },
    ],
    classes: [
      { id: LEAD, name: "Production lead" },
      { id: ENGINEER, name: "Engineer" },
      { id: STUDENT, name: "Student / OPS" },
    ],
    pools: [
      { id: STUDIO, name: "Studio", unit_label: "half-day" },
      { id: EDIT, name: "Edit suite", unit_label: "hour" },
    ],
    resources: [
      { pool_id: STUDIO, available_units: 60, concurrent_units: 1, windows: FALLBACK_WINDOWS },
      { pool_id: EDIT, available_units: 200, concurrent_units: 1, windows: FALLBACK_WINDOWS },
    ],
    blackouts: [],
    holds: [],
    bookings: [],
    nowISO: NOW,
    ...overrides,
  };
}

const REQUEST = {
  pool_id: STUDIO,
  date: "2027-02-01",
  window_start: "08:00",
  window_end: "12:00",
  hours: { [LEAD]: 5 },
  treatment: "incremental" as const,
};

describe("capacitySummary", () => {
  it("reproduces the framework's envelope at the placeholders, per class", () => {
    const [lead, engineer] = capacitySummary(state());
    expect(lead).toMatchObject({ name: "Production lead", net: 800, reserve: 120, open: 680 });
    expect(engineer).toMatchObject({ name: "Engineer", net: 400, reserve: 60, open: 340 });
    expect(totalCapacity(capacitySummary(state()))).toMatchObject({ net: 1200, open: 1020 });
  });

  it("draws strategic bookings from the reserve and the rest from open capacity, holds from open, by class", () => {
    const [lead, engineer] = capacitySummary(
      state({
        holds: [hold({ id: "h1", hours: { [LEAD]: 8, [ENGINEER]: 2 } })],
        bookings: [
          booking({ id: "s", treatment: "strategic", hours: { [LEAD]: 30 } }),
          booking({ id: "i", treatment: "incremental", hours: { [LEAD]: 10, [ENGINEER]: 6 } }),
          booking({ id: "x", treatment: "external", hours: { [LEAD]: 5 } }),
          booking({ id: "r", status: "released", hours: { [LEAD]: 100 } }),
          booking({
            id: "t",
            status: "tentative",
            expires_at: "2027-01-01T00:00:00.000Z",
            hours: { [LEAD]: 100 },
          }),
        ],
      }),
    );
    expect(lead).toMatchObject({
      strategicBooked: 30,
      reserveRemaining: 90,
      nonStrategicBooked: 15,
      held: 8,
      open: 800 - 120 - 8 - 15,
      booked: 45,
    });
    expect(engineer).toMatchObject({ nonStrategicBooked: 6, held: 2, open: 400 - 60 - 2 - 6 });
  });

  it("counts an unexpired tentative hold as taken", () => {
    const [lead] = capacitySummary(
      state({
        bookings: [
          booking({ id: "t", status: "tentative", expires_at: "2027-01-18T15:00:00.000Z" }),
        ],
      }),
    );
    expect(lead!.nonStrategicBooked).toBe(4);
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
    const noResource = checkBooking({ ...REQUEST, pool_id: "field" }, state());
    expect(noResource.ok).toBe(false);
    if (!noResource.ok) expect(noResource.refusal.reason).toBe("no_resource");
  });

  it("step 1: a blackout on the pool, or on every pool, refuses and names its reason", () => {
    const blackout = {
      id: "b",
      starts_on: "2027-01-30",
      ends_on: "2027-02-02",
      pool_ids: null,
      reason: "Spring pledge drive",
    };
    const result = checkBooking(REQUEST, state({ blackouts: [blackout] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.reason).toBe("blacked_out");
      expect(result.refusal.message).toContain("Spring pledge drive");
      expect(result.alternatives[0]).toMatchObject({ date: "2027-02-03" });
    }
    expect(
      checkBooking(REQUEST, state({ blackouts: [{ ...blackout, pool_ids: [EDIT] }] })).ok,
    ).toBe(true);
  });

  it("step 1: a core hold overlapping the window refuses on a one-unit pool", () => {
    const result = checkBooking(
      REQUEST,
      state({ holds: [hold({ id: "h", window_start: "10:00", window_end: "14:00", hours: {} })] }),
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
            hours: { [LEAD]: 2 },
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

  it("step 3: a pool with two concurrent units takes two bookings in one window, not three", () => {
    const twoKits = state({
      resources: [
        { pool_id: STUDIO, available_units: 60, concurrent_units: 2, windows: FALLBACK_WINDOWS },
      ],
      bookings: [booking({ id: "a", hours: { [LEAD]: 1 } })],
    });
    expect(checkBooking({ ...REQUEST, hours: { [LEAD]: 1 } }, twoKits).ok).toBe(true);
    const full = checkBooking(
      { ...REQUEST, hours: { [LEAD]: 1 } },
      { ...twoKits, bookings: [...twoKits.bookings, booking({ id: "b", hours: { [LEAD]: 1 } })] },
    );
    expect(full.ok).toBe(false);
    if (!full.ok) {
      expect(full.refusal.reason).toBe("window_taken");
      expect(full.refusal).toMatchObject({ taken: 2, concurrentUnits: 2 });
    }
  });

  it("step 3: moving a booking never collides with itself", () => {
    const result = checkBooking(
      { ...REQUEST, excludeBookingId: "me" },
      state({ bookings: [booking({ id: "me" })] }),
    );
    expect(result.ok).toBe(true);
  });

  it("step 4: a class's day is headcount × hours a day, across bookings and holds", () => {
    // The lead: 2 h held + 2 h booked, 4 of 8 left, 5 asked.
    const full = checkBooking(
      REQUEST,
      state({
        holds: [
          hold({
            id: "h",
            pool_id: null,
            window_start: "06:00",
            window_end: "07:00",
            hours: { [LEAD]: 2 },
          }),
        ],
        bookings: [
          booking({ id: "pm", window_start: "13:00", window_end: "17:00", hours: { [LEAD]: 2 } }),
        ],
      }),
    );
    expect(full.ok).toBe(false);
    if (!full.ok) {
      expect(full.refusal.reason).toBe("day_full");
      expect(full.refusal).toMatchObject({ classId: LEAD, remaining: 4 });
    }
    // Two engineers: 16 hours a day between them.
    const engineers = checkBooking(
      { ...REQUEST, hours: { [ENGINEER]: 10 } },
      state({
        bookings: [
          booking({
            id: "pm",
            window_start: "13:00",
            window_end: "17:00",
            hours: { [ENGINEER]: 6 },
          }),
        ],
      }),
    );
    expect(engineers.ok).toBe(true);
    const third = checkBooking(
      { ...REQUEST, hours: { [ENGINEER]: 11 } },
      state({
        bookings: [
          booking({
            id: "pm",
            window_start: "13:00",
            window_end: "17:00",
            hours: { [ENGINEER]: 6 },
          }),
        ],
      }),
    );
    expect(third.ok).toBe(false);
    expect(
      classHoursOn(
        "2027-02-01",
        LEAD,
        [hold({ id: "h", hours: { [LEAD]: 2 } })],
        [booking({ id: "b", hours: { [LEAD]: 2 } })],
        NOW,
      ),
    ).toBe(4);
  });

  it("step 4: a class the plan does not track (students) is not day- or capacity-checked", () => {
    expect(checkBooking({ ...REQUEST, hours: { [STUDENT]: 40 } }, state()).ok).toBe(true);
  });

  it("step 5: a strategic booking draws the class's reserve, not open capacity", () => {
    const nearlyFull = state({
      bookings: [
        booking({ id: "s", treatment: "strategic", date: "2027-03-01", hours: { [LEAD]: 118 } }),
      ],
    });
    const refused = checkBooking({ ...REQUEST, treatment: "strategic" }, nearlyFull);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.refusal.reason).toBe("reserve_exhausted");
      expect(refused.refusal).toMatchObject({ classId: LEAD, remaining: 2 });
      expect(refused.alternatives).toEqual([]);
    }
    expect(checkBooking(REQUEST, nearlyFull).ok).toBe(true);
  });

  it("step 5: incremental and external bookings draw the class's open capacity, which holds reduce", () => {
    const tight = state({
      holds: [hold({ id: "h", date: "2027-03-01", hours: { [LEAD]: 600 } })],
      bookings: [
        booking({ id: "x", treatment: "external", date: "2027-03-02", hours: { [LEAD]: 76 } }),
      ],
    });
    // open = 800 − 120 − 600 − 76 = 4
    const refused = checkBooking(REQUEST, tight);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.refusal.reason).toBe("open_capacity_exhausted");
      expect(refused.refusal).toMatchObject({ classId: LEAD, remaining: 4 });
    }
    expect(checkBooking({ ...REQUEST, hours: { [LEAD]: 4 } }, tight).ok).toBe(true);
  });

  it("warns, never blocks, when a booking takes more than half a month's remaining open capacity", () => {
    // 117 term days; February has 28 → open share (680 + 340) × 28 / 117 ≈ 244.1 h.
    // With 232 h booked in February, ~12.1 h remain; 7 h is more than half.
    const sold = state({
      bookings: Array.from({ length: 29 }, (_, i) =>
        booking({
          id: `feb-${i}`,
          date: `2027-02-${String(1 + (i % 28)).padStart(2, "0")}`,
          hours: { [LEAD]: 8 },
          window_start: i < 28 ? "08:00" : "13:00",
          window_end: i < 28 ? "12:00" : "17:00",
        }),
      ),
    });
    const result = checkBooking(
      {
        ...REQUEST,
        date: "2027-02-27",
        window_start: "13:00",
        window_end: "17:00",
        hours: { [ENGINEER]: 7 },
      },
      sold,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("February 2027");
    }
    expect(monthShareWarning({ ...REQUEST, hours: { [ENGINEER]: 5 } }, sold)).toBeNull();
    expect(monthShareWarning({ ...REQUEST, hours: { [LEAD]: 7 } }, state())).toBeNull();
    expect(
      monthShareWarning({ ...REQUEST, treatment: "strategic", hours: { [LEAD]: 7 } }, sold),
    ).toBeNull();
  });
});

describe("nextOpenWindows", () => {
  it("searches the asked day's other windows, then outward by day, within the plan", () => {
    const alternatives = nextOpenWindows(
      { ...REQUEST, date: "2027-01-11", hours: { [LEAD]: 4 } },
      state({
        bookings: [
          booking({
            id: "a",
            date: "2027-01-11",
            window_start: "08:00",
            window_end: "12:00",
            hours: { [LEAD]: 2 },
          }),
          booking({
            id: "b",
            date: "2027-01-11",
            window_start: "13:00",
            window_end: "17:00",
            hours: { [LEAD]: 2 },
          }),
        ],
        resources: [
          {
            pool_id: STUDIO,
            available_units: 60,
            concurrent_units: 1,
            windows: [
              ...FALLBACK_WINDOWS,
              { key: "evening", label: "Evening", start: "17:00", end: "21:00" },
            ],
          },
        ],
      }),
      2,
    );
    expect(alternatives).toEqual([
      { date: "2027-01-11", window_start: "17:00", window_end: "21:00", label: "Evening" },
      { date: "2027-01-12", window_start: "08:00", window_end: "12:00", label: "Morning" },
    ]);
  });
});

describe("monthlyCapacity", () => {
  it("spreads open capacity by the term's days in each month and nets off that month's bookings", () => {
    const months = monthlyCapacity(
      state({
        bookings: [
          booking({ id: "feb", date: "2027-02-10", hours: { [LEAD]: 20, [STUDENT]: 50 } }),
        ],
      }),
    );
    expect(months.map((m) => m.month)).toEqual([
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
    ]);
    const total = months.reduce((sum, m) => sum + m.openShare, 0);
    expect(Math.abs(total - 1020)).toBeLessThan(0.1);
    const february = months.find((m) => m.month === "2027-02");
    // Student hours are not tracked capacity and do not count.
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

  it("round-trips the resource form's lines", () => {
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

  it("formats hours as days once there is a day of them", () => {
    expect(formatHours(5)).toBe("5 h");
    expect(formatHours(8)).toBe("1 day (8 h)");
    expect(formatHours(120)).toBe("15 days (120 h)");
    expect(formatHours(12)).toBe("1.5 days (12 h)");
  });

  it("collects hours-per-class rows, dropping zeros", () => {
    expect(
      hoursByClass([
        { labor_class_id: LEAD, hours: 4 },
        { labor_class_id: STUDENT, hours: 0 },
        { labor_class_id: LEAD, hours: 1.5 },
      ]),
    ).toEqual({ [LEAD]: 5.5 });
  });

  it("gives a tentative hold the 14-day expiry", () => {
    expect(tentativeExpiry("2027-01-04T15:00:00.000Z")).toBe("2027-01-18T15:00:00.000Z");
  });
});

// §6.4 step 2 (slice 5): a reserved block another partner's active agreement
// still holds on the window. bk_booking_allowed() is the twin.
describe("checkBooking — reserved blocks", () => {
  // NOW is 2027-01-04; the block is on Feb 1 with a 7-day release deadline (Jan 25).
  const reserved = {
    id: "rb1",
    pool_id: STUDIO,
    date: "2027-02-01",
    window_start: "08:00",
    window_end: "12:00",
    project_id: null,
    booking_id: null,
    released_at: null,
    kept_by: null,
    agreement_id: "a1",
    agreement_label: "OUR Voices",
    agreement_status: "active" as const,
    release_deadline_days: 7,
    partner_id: "our",
    partner_name: "Office of Undergraduate Research",
  };

  it("refuses another partner's booking on the window, naming the partner and the deadline", () => {
    const result = checkBooking(
      { ...REQUEST, partnerId: "libraries" },
      state({ reservedBlocks: [reserved] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.reason).toBe("reserved");
      expect(result.refusal.message).toMatch(/Office of Undergraduate Research/);
      expect(result.refusal.message).toMatch(/2027-01-25/);
      // The alternatives skip the reserved window.
      expect(
        result.alternatives.every((a) => a.window_start !== "08:00" || a.date !== "2027-02-01"),
      ).toBe(true);
    }
  });

  it("refuses a booking with no partner (the calendar's own) the same way", () => {
    const result = checkBooking(REQUEST, state({ reservedBlocks: [reserved] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusal.reason).toBe("reserved");
  });

  it("never refuses the partner the block is held for", () => {
    expect(
      checkBooking({ ...REQUEST, partnerId: "our" }, state({ reservedBlocks: [reserved] })).ok,
    ).toBe(true);
  });

  it("stops reserving after the release deadline unless the director kept it", () => {
    const later = "2027-01-26T15:00:00.000Z";
    expect(
      checkBooking(
        { ...REQUEST, partnerId: "libraries" },
        state({ reservedBlocks: [reserved], nowISO: later }),
      ).ok,
    ).toBe(true);
    const kept = checkBooking(
      { ...REQUEST, partnerId: "libraries" },
      state({ reservedBlocks: [{ ...reserved, kept_by: "director" }], nowISO: later }),
    );
    expect(kept.ok).toBe(false);
  });

  it("ignores a draft agreement's blocks and a released block", () => {
    expect(
      checkBooking(
        { ...REQUEST, partnerId: "libraries" },
        state({ reservedBlocks: [{ ...reserved, agreement_status: "draft" }] }),
      ).ok,
    ).toBe(true);
    expect(
      checkBooking(
        { ...REQUEST, partnerId: "libraries" },
        state({ reservedBlocks: [{ ...reserved, released_at: "2027-01-02T00:00:00Z" }] }),
      ).ok,
    ).toBe(true);
  });

  it("takes one of several concurrent units rather than the whole window", () => {
    const two = state({
      resources: [
        { pool_id: STUDIO, available_units: 60, concurrent_units: 2, windows: FALLBACK_WINDOWS },
      ],
      reservedBlocks: [reserved],
    });
    expect(checkBooking({ ...REQUEST, partnerId: "libraries" }, two).ok).toBe(true);
    const full = checkBooking(
      { ...REQUEST, partnerId: "libraries" },
      { ...two, bookings: [booking({ id: "b1" })] },
    );
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.refusal.reason).toBe("reserved");
  });

  it("counts a block whose own booking is live once, as that booking", () => {
    const attached = { ...reserved, project_id: "p1", booking_id: "b1" };
    const two = state({
      resources: [
        { pool_id: STUDIO, available_units: 60, concurrent_units: 2, windows: FALLBACK_WINDOWS },
      ],
      reservedBlocks: [attached],
      // Two hours, so the lead's day still has room for the request's five.
      bookings: [booking({ id: "b1", hours: { [LEAD]: 2 } })],
    });
    expect(checkBooking({ ...REQUEST, partnerId: "libraries" }, two).ok).toBe(true);
  });

  it("does not refuse the booking the block is attached to when it is re-checked", () => {
    const attached = { ...reserved, project_id: "p1", booking_id: "b1" };
    expect(
      checkBooking(
        { ...REQUEST, partnerId: "libraries", excludeBookingId: "b1" },
        state({ reservedBlocks: [attached] }),
      ).ok,
    ).toBe(true);
  });
});
