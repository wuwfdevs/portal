import { describe, expect, it } from "vitest";
import { buildBookingPlan, planHours, type PlanLine } from "./booking-plan";
import { derivePricing, estimateTotals, priceLine, type CardLineLike } from "./pricing";
import { buildRateCard } from "./rates";
import { LEAD, STUDENT, V01, V01_PACKAGES } from "./rates.fixture";
import { FALLBACK_WINDOWS, type CalendarState } from "./scheduling";
import { buildSummary, capacityStatusFor, hourBuckets } from "./summary";

// The acceptance path (docs/bookings-design.md §18): a standard Basic event
// webcast for an existing UWF unit, on a valid date with nothing unusual, goes
// from the workbook's figures to a send-ready summary line with no step that
// asks a person for anything but the partner, the service and the date.

const card = buildRateCard(V01, V01_PACKAGES);
const webcast = card.packages.find((p) => p.key === "webcast_basic")!;
const CARD: CardLineLike[] = [
  {
    kind: "package",
    package_id: "webcast_basic",
    labor_class_id: null,
    strategic_rate: webcast.strategicRate,
    incremental_rate: webcast.incrementalRate,
    external_rate: webcast.externalRate,
  },
];

const state: CalendarState = {
  plan: { starts_on: "2027-01-11", ends_on: "2027-05-07", reserve_share: 0.15 },
  capacity: [{ labor_class_id: "lead", net_hours: 800, headcount: 1, hours_per_person_day: 8 }],
  classes: [
    { id: "lead", name: LEAD.name },
    { id: "student", name: STUDENT.name },
  ],
  pools: V01.pools.map((p) => ({ id: p.id, name: p.name, unit_label: p.unitLabel })),
  resources: [
    { pool_id: "live", available_units: 60, concurrent_units: 1, windows: [{ key: "day", label: "Day", start: "08:00", end: "17:00" }] },
    { pool_id: "webcast", available_units: 20, concurrent_units: 1, windows: [] },
    { pool_id: "studio", available_units: 120, concurrent_units: 1, windows: FALLBACK_WINDOWS },
  ],
  blackouts: [],
  holds: [],
  bookings: [],
  nowISO: "2027-01-04T15:00:00.000Z",
};

describe("the happy path: a standard Basic webcast for an existing UWF unit", () => {
  const line: PlanLine & { kind: "package" } = {
    kind: "package",
    quantity: 1,
    labor_hours: { lead: 5, student: 10 },
    resource_units: { live: 1, webcast: 1 },
  };
  const classes = [
    { id: "lead", charged_in_strategic: false },
    { id: "student", charged_in_strategic: true },
  ];

  it("books itself from the date alone, with nothing for the person to decide", () => {
    const plan = buildBookingPlan(
      { date: "2027-02-01", lines: [line], treatment: "incremental", partnerId: "libraries" },
      state,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.warnings).toEqual([]);
    expect(planHours(plan.bookings.map(() => line).slice(0, 1))).toEqual({ lead: 5, student: 10 });
  });

  it("reads as one send-ready line at the university rate when the strategic question is unanswered", () => {
    const pricing = derivePricing({
      partnerKind: "uwf_unit",
      underAgreement: false,
      qualifiesStrategic: null,
      reserveCovers: null,
    });
    expect(pricing.treatment).toBe("incremental");
    const priced = priceLine(
      { kind: "package", package_id: "webcast_basic", labor_class_id: null, quantity: 1, unit_rate: 0 },
      pricing.treatment,
      CARD,
      classes,
      V01.assessmentShare,
    );
    expect(priced).toMatchObject({ ok: true, price: { unit_rate: 800, amount: 800 } });
    const total = estimateTotals([
      {
        kind: "package",
        package_id: "webcast_basic",
        labor_class_id: null,
        unit_label: "event",
        quantity: 1,
        unit_rate: 800,
        amount: 800,
        labor_hours: line.labor_hours,
      },
    ]).total;
    const { text } = buildSummary({
      services: ["Basic event webcast (event)"],
      hours: hourBuckets([line], classes),
      priced: true,
      total,
      treatment: pricing.treatment,
      capacity: capacityStatusFor({
        needsDates: true,
        hasTerm: true,
        eventDate: "2027-02-01",
        openBookings: 2,
        planFailed: false,
        failingDates: 0,
        warnings: 0,
        estimate: { kind: "none" },
        heldUntil: null,
      }),
      contribution: null,
      estimate: { kind: "none" },
      readyToSend: true,
    });
    expect(text).toBe(
      "Basic event webcast (event) · 5 staff hours, 10 student hours · $800 · University rate · Capacity available · No WUWF contribution · Ready to send",
    );
    expect(text).not.toMatch(/\b(pool|labor class|treatment|draw|reserve|rate model version)\b/i);
  });

  it("answering yes to strategic work, with the reserve covering it, prices the university rate WUWF contributes to", () => {
    const pricing = derivePricing({
      partnerKind: "uwf_unit",
      underAgreement: false,
      qualifiesStrategic: true,
      reserveCovers: true,
    });
    expect(pricing).toMatchObject({ treatment: "strategic", reserveDepleted: false });
    const priced = priceLine(
      { kind: "package", package_id: "webcast_basic", labor_class_id: null, quantity: 1, unit_rate: 0 },
      pricing.treatment,
      CARD,
      classes,
      V01.assessmentShare,
    );
    expect(priced).toMatchObject({ ok: true, price: { unit_rate: 575 } });
  });
});
