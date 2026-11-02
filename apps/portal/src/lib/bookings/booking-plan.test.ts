import { describe, expect, it } from "vitest";
import {
  buildBookingPlan,
  planHours,
  plainRefusal,
  poolDemand,
  timeOfDayOptions,
  type PlanInput,
  type PlanLine,
} from "./booking-plan";
import type { CalendarState, ResourceWindow } from "./scheduling";

const LEAD = "lead";
const STUDENT = "student";
const STUDIO = "studio";
const LIVE = "live";
const WEBCAST = "webcast";
const NOW = "2027-01-04T15:00:00.000Z";
const DAY: ResourceWindow = { key: "day", label: "Day", start: "08:00", end: "17:00" };
const AM: ResourceWindow = { key: "am", label: "Morning", start: "08:00", end: "12:00" };
const PM: ResourceWindow = { key: "pm", label: "Afternoon", start: "13:00", end: "17:00" };

function state(overrides: Partial<CalendarState> = {}): CalendarState {
  return {
    plan: { starts_on: "2027-01-11", ends_on: "2027-05-07" },
    capacity: [
      {
        labor_class_id: LEAD,
        net_hours: 800,
        reserve_share: 0.15,
        headcount: 1,
        hours_per_person_day: 8,
      },
    ],
    classes: [
      { id: LEAD, name: "Production lead" },
      { id: STUDENT, name: "Student / OPS" },
    ],
    pools: [
      { id: STUDIO, name: "Studio", unit_label: "half-day" },
      { id: LIVE, name: "Live package", unit_label: "day" },
      { id: WEBCAST, name: "Webcast operations", unit_label: "event" },
    ],
    resources: [
      { pool_id: STUDIO, available_units: 120, concurrent_units: 1, windows: [AM, PM] },
      { pool_id: LIVE, available_units: 60, concurrent_units: 1, windows: [DAY] },
      { pool_id: WEBCAST, available_units: 20, concurrent_units: 1, windows: [] },
    ],
    blackouts: [],
    holds: [],
    bookings: [],
    nowISO: NOW,
    ...overrides,
  };
}

// The workbook's Basic event webcast: 5 staff + 10 student hours, one live day, one event.
const BASIC_WEBCAST: PlanLine = {
  quantity: 1,
  labor_hours: { [LEAD]: 5, [STUDENT]: 10 },
  resource_units: { [LIVE]: 1, [WEBCAST]: 1 },
};
const STUDIO_HALF_DAY: PlanLine = {
  quantity: 1,
  labor_hours: { [LEAD]: 1, [STUDENT]: 2 },
  resource_units: { [STUDIO]: 1 },
};

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    date: "2027-02-01",
    lines: [BASIC_WEBCAST],
    treatment: "incremental",
    partnerId: "partner",
    ...overrides,
  };
}

describe("poolDemand and planHours", () => {
  it("multiply by quantity and add across lines", () => {
    const lines: PlanLine[] = [
      { ...STUDIO_HALF_DAY, quantity: 2 },
      { quantity: 1, labor_hours: { [LEAD]: 3 }, resource_units: { [STUDIO]: 0.5, [LIVE]: 1 } },
    ];
    expect(poolDemand(lines)).toEqual({ [STUDIO]: 2.5, [LIVE]: 1 });
    expect(planHours(lines)).toEqual({ [LEAD]: 5, [STUDENT]: 4 });
  });

  it("drops zero rows", () => {
    expect(poolDemand([{ quantity: 1, labor_hours: {}, resource_units: { [LIVE]: 0 } }])).toEqual(
      {},
    );
  });
});

describe("buildBookingPlan — the happy path", () => {
  it("books a standard Basic Webcast from the date alone: live day, webcast attaches, hours on the primary", () => {
    const plan = buildBookingPlan(input(), state());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.bookings).toHaveLength(2);
    const [primary, attached] = plan.bookings;
    expect(primary).toMatchObject({
      pool_id: LIVE,
      date: "2027-02-01",
      window_start: "08:00",
      window_end: "17:00",
      primary: true,
      hours: { [LEAD]: 5, [STUDENT]: 10 },
    });
    // Webcast operations has no window of its own: it takes the primary's, with no hours.
    expect(attached).toMatchObject({
      pool_id: WEBCAST,
      window_start: "08:00",
      window_end: "17:00",
      primary: false,
      hours: {},
    });
  });

  it("with nothing to hold, plans nothing and says so by returning no bookings", () => {
    const plan = buildBookingPlan(
      input({ lines: [{ quantity: 1, labor_hours: { [LEAD]: 1 }, resource_units: {} }] }),
      state(),
    );
    expect(plan).toEqual({ ok: true, bookings: [], warnings: [] });
  });

  it("tries the anchor's windows in order and takes the first that passes", () => {
    const busy = state({
      bookings: [
        {
          id: "b",
          pool_id: STUDIO,
          date: "2027-02-01",
          window_start: "08:00",
          window_end: "12:00",
          treatment: "incremental",
          status: "confirmed",
          expires_at: null,
          label: "Someone else",
          hours: {},
        },
      ],
    });
    const plan = buildBookingPlan(input({ lines: [STUDIO_HALF_DAY] }), busy);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.bookings[0]).toMatchObject({ window_start: "13:00", window_end: "17:00" });
  });

  it("honors the window staff picked", () => {
    const plan = buildBookingPlan(
      input({ lines: [STUDIO_HALF_DAY], window: { start: "13:00", end: "17:00" } }),
      state(),
    );
    expect(plan.ok && plan.bookings[0]).toMatchObject({ window_start: "13:00" });
  });
});

describe("buildBookingPlan — a pool that can't share the timing", () => {
  const eveningOnly: ResourceWindow = { key: "eve", label: "Evening", start: "18:00", end: "21:00" };
  const split = state({
    resources: [
      { pool_id: STUDIO, available_units: 120, concurrent_units: 1, windows: [AM, PM] },
      { pool_id: LIVE, available_units: 60, concurrent_units: 1, windows: [eveningOnly] },
      { pool_id: WEBCAST, available_units: 20, concurrent_units: 1, windows: [] },
    ],
  });
  const both: PlanLine = {
    quantity: 1,
    labor_hours: { [LEAD]: 2 },
    resource_units: { [STUDIO]: 2, [LIVE]: 1 },
  };

  it("is an exception in plain words, creating nothing", () => {
    const plan = buildBookingPlan(input({ lines: [both] }), split);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("mismatch");
    expect(plan.message).toMatch(/can't share/);
    expect(plan.message).not.toMatch(/pool|reserve|treatment|draw|labor class/i);
  });
});

describe("buildBookingPlan — refusals and alternatives", () => {
  it("names a blackout in plain language and offers the nearest dates where the whole plan passes", () => {
    const blacked = state({
      blackouts: [
        { id: "x", starts_on: "2027-02-01", ends_on: "2027-02-02", pool_ids: null, reason: "Spring break" },
      ],
    });
    const plan = buildBookingPlan(input(), blacked);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("refused");
    // The refusal names the resource it was about, for the term report's refusals by resource.
    expect(plan.poolId).toBe(LIVE);
    expect(plan.message).toBe("WUWF isn't taking partner work then: Spring break.");
    expect(plan.alternatives.map((a) => a.date)).toEqual(["2027-02-03", "2027-02-04", "2027-01-29"]);
  });

  it("refuses when the term has no such resource", () => {
    const plan = buildBookingPlan(input(), state({ resources: [] }));
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.code).toBe("no_resource");
  });

  it("refuses a date outside the term", () => {
    const plan = buildBookingPlan(input({ date: "2026-12-01" }), state());
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.message).toContain("outside the current term");
  });

  it("refuses when the day is already full, and says staff time without class jargon", () => {
    const full = state({
      holds: [
        {
          id: "h",
          pool_id: null,
          date: "2027-02-01",
          window_start: "08:00",
          window_end: "17:00",
          kind: "core",
          label: "Pledge drive",
          hours: { [LEAD]: 8 },
        },
      ],
    });
    const plan = buildBookingPlan(input(), full);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.message).toMatch(/Staff time is full that day/);
  });

  it("passes the project's treatment to the rule: a strategic plan needs the reserve", () => {
    const tight = state({
      capacity: [
        {
          labor_class_id: LEAD,
          net_hours: 20,
          reserve_share: 0.15,
          headcount: 1,
          hours_per_person_day: 8,
        },
      ],
    });
    expect(buildBookingPlan(input({ treatment: "strategic" }), tight).ok).toBe(false);
    expect(buildBookingPlan(input({ treatment: "incremental" }), tight).ok).toBe(true);
  });

  it("never lets a partner's own reserved block refuse them", () => {
    const withBlock = state({
      reservedBlocks: [
        {
          id: "rb",
          pool_id: LIVE,
          date: "2027-02-01",
          window_start: "08:00",
          window_end: "17:00",
          project_id: null,
          released_at: null,
          kept_by: "u",
          agreement_id: "a",
          agreement_label: "OUR Voices",
          agreement_status: "active",
          release_deadline_days: 7,
          partner_id: "partner",
          partner_name: "Honors College",
        },
      ],
    });
    expect(buildBookingPlan(input({ partnerId: "partner" }), withBlock).ok).toBe(true);
    const other = buildBookingPlan(input({ partnerId: "someone-else" }), withBlock);
    expect(other.ok).toBe(false);
    if (other.ok) return;
    expect(other.message).toContain("reserved for Honors College");
  });
});

describe("plainRefusal", () => {
  it("never uses the model's vocabulary", () => {
    const text = plainRefusal(
      { reason: "reserve_exhausted", message: "x", classId: LEAD, remaining: 0 },
      { poolName: "Studio", date: "2027-02-01" },
    );
    expect(text).not.toMatch(/reserve|treatment|pool|draw/i);
  });
});

describe("timeOfDayOptions", () => {
  it("offers only windows of pools that offer a choice, once each", () => {
    expect(timeOfDayOptions(state())).toEqual([
      { key: "08:00-12:00", label: "Morning", start: "08:00", end: "12:00" },
      { key: "13:00-17:00", label: "Afternoon", start: "13:00", end: "17:00" },
    ]);
  });
});
