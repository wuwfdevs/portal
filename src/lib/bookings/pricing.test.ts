import { describe, expect, it } from "vitest";
import {
  LEGACY_WEBCAST_RATE,
  derivePricing,
  estimateDraw,
  estimateMargin,
  estimateTotals,
  legacyRateDelta,
  priceLine,
  reserveCoversDraw,
  type CardLineLike,
  type EstimateLineLike,
} from "./pricing";
import type { ClassCapacitySummary } from "./scheduling";

// The v0.1 card (docs/bookings-design.md §7): a basic webcast is $575 /
// $800 / $1,150; the lead's loaded hour is $42.19 ($65 external), a
// student's $16.20 ($25 external).
const LEAD = "lead";
const STUDENT = "student";
const WEBCAST = "pkg-webcast";
const CARD: CardLineLike[] = [
  {
    kind: "package",
    package_id: WEBCAST,
    labor_class_id: null,
    strategic_rate: 575,
    incremental_rate: 800,
    external_rate: 1150,
  },
  {
    kind: "labor",
    package_id: null,
    labor_class_id: LEAD,
    strategic_rate: null,
    incremental_rate: 42.19,
    external_rate: 65,
  },
  {
    kind: "labor",
    package_id: null,
    labor_class_id: STUDENT,
    strategic_rate: null,
    incremental_rate: 16.2,
    external_rate: 25,
  },
];
const CLASSES = [
  { id: LEAD, charged_in_strategic: false },
  { id: STUDENT, charged_in_strategic: true },
];

function summary(classId: string, reserveRemaining: number): ClassCapacitySummary {
  return {
    labor_class_id: classId,
    name: classId,
    net: 800,
    reserve: 120,
    strategicBooked: 120 - reserveRemaining,
    reserveRemaining,
    held: 0,
    nonStrategicBooked: 0,
    open: 680,
    booked: 0,
    headcount: 1,
    hoursPerPersonDay: 8,
  };
}

describe("derivePricing", () => {
  it("prices an outside partner external, whatever else is true", () => {
    expect(
      derivePricing({
        partnerKind: "external",
        underAgreement: false,
        qualifiesStrategic: true,
        reserveCovers: true,
      }).treatment,
    ).toBe("external");
  });
  it("prices qualifying work strategic when the reserve covers it, else incremental with the reason", () => {
    const covered = derivePricing({
      partnerKind: "uwf_unit",
      underAgreement: false,
      qualifiesStrategic: true,
      reserveCovers: true,
    });
    expect(covered.treatment).toBe("strategic");
    const notCovered = derivePricing({
      partnerKind: "uwf_unit",
      underAgreement: false,
      qualifiesStrategic: true,
      reserveCovers: false,
    });
    expect(notCovered.treatment).toBe("incremental");
    expect(notCovered.reason).toMatch(/does not cover/);
    const noDraw = derivePricing({
      partnerKind: "uwf_unit",
      underAgreement: false,
      qualifiesStrategic: true,
      reserveCovers: null,
    });
    expect(noDraw.treatment).toBe("strategic");
  });
  it("prices everything else incremental, saying whether the judgment is still open", () => {
    expect(
      derivePricing({
        partnerKind: "uwf_unit",
        underAgreement: false,
        qualifiesStrategic: null,
        reserveCovers: null,
      }).reason,
    ).toMatch(/Not yet judged/);
    expect(
      derivePricing({
        partnerKind: "uwf_unit",
        underAgreement: false,
        qualifiesStrategic: false,
        reserveCovers: true,
      }).treatment,
    ).toBe("incremental");
  });
  it("prices an agreement against its reserve share first", () => {
    expect(
      derivePricing({
        partnerKind: "uwf_unit",
        underAgreement: true,
        qualifiesStrategic: null,
        reserveCovers: true,
      }).treatment,
    ).toBe("strategic");
    expect(
      derivePricing({
        partnerKind: "uwf_unit",
        underAgreement: true,
        qualifiesStrategic: null,
        reserveCovers: false,
      }).treatment,
    ).toBe("incremental");
  });
});

describe("reserveCoversDraw", () => {
  it("checks only baseline-funded classes the term tracks", () => {
    expect(reserveCoversDraw({ [LEAD]: 5, [STUDENT]: 10 }, CLASSES, [summary(LEAD, 20)])).toBe(
      true,
    );
    expect(reserveCoversDraw({ [LEAD]: 25, [STUDENT]: 10 }, CLASSES, [summary(LEAD, 20)])).toBe(
      false,
    );
    // Students are charged in a strategic price, so their hours never draw the reserve.
    expect(
      reserveCoversDraw({ [STUDENT]: 400 }, CLASSES, [summary(LEAD, 20), summary(STUDENT, 0)]),
    ).toBeNull();
    // A class with no capacity row that term is not checked.
    expect(reserveCoversDraw({ [LEAD]: 500 }, CLASSES, [])).toBeNull();
  });
});

function line(overrides: Partial<EstimateLineLike>): EstimateLineLike {
  return {
    kind: "package",
    package_id: WEBCAST,
    labor_class_id: null,
    unit_label: "event",
    quantity: 1,
    unit_rate: 0,
    amount: 0,
    labor_hours: { [LEAD]: 5, [STUDENT]: 10 },
    ...overrides,
  };
}

describe("priceLine", () => {
  it("takes a package's card rate for the treatment", () => {
    expect(priceLine(line({ quantity: 2 }), "strategic", CARD, CLASSES, 0.0671)).toEqual({
      ok: true,
      price: { unit_rate: 575, amount: 1150 },
    });
    expect(priceLine(line({}), "external", CARD, CLASSES, 0.0671)).toEqual({
      ok: true,
      price: { unit_rate: 1150, amount: 1150 },
    });
  });
  it("makes a baseline-funded class's hours WUWF's contribution under strategic pricing", () => {
    const lead = line({
      kind: "labor",
      package_id: null,
      labor_class_id: LEAD,
      unit_label: "hour",
      quantity: 3,
    });
    expect(priceLine(lead, "strategic", CARD, CLASSES, 0)).toEqual({
      ok: true,
      price: { unit_rate: 0, amount: 0 },
    });
    expect(priceLine(lead, "incremental", CARD, CLASSES, 0)).toEqual({
      ok: true,
      price: { unit_rate: 42.19, amount: 126.57 },
    });
    expect(priceLine(lead, "external", CARD, CLASSES, 0)).toEqual({
      ok: true,
      price: { unit_rate: 65, amount: 195 },
    });
    const student = line({
      kind: "labor",
      package_id: null,
      labor_class_id: STUDENT,
      unit_label: "hour",
      quantity: 2,
    });
    expect(priceLine(student, "strategic", CARD, CLASSES, 0)).toEqual({
      ok: true,
      price: { unit_rate: 16.2, amount: 32.4 },
    });
  });
  it("passes an expense through at cost, plus the assessment when external", () => {
    const travel = line({
      kind: "expense",
      package_id: null,
      unit_label: "each",
      quantity: 1,
      unit_rate: 100,
    });
    expect(priceLine(travel, "incremental", CARD, CLASSES, 0.0671)).toEqual({
      ok: true,
      price: { unit_rate: 100, amount: 100 },
    });
    expect(priceLine(travel, "external", CARD, CLASSES, 0.0671)).toEqual({
      ok: true,
      price: { unit_rate: 106.71, amount: 106.71 },
    });
  });
  it("reports a package or class missing from the card", () => {
    expect(priceLine(line({ package_id: "other" }), "incremental", CARD, CLASSES, 0)).toMatchObject(
      {
        ok: false,
      },
    );
  });
});

describe("the estimate", () => {
  const lines: EstimateLineLike[] = [
    line({ quantity: 2, unit_rate: 800, amount: 1600 }),
    line({
      kind: "labor",
      package_id: null,
      labor_class_id: LEAD,
      unit_label: "hour",
      quantity: 4,
      unit_rate: 42.19,
      amount: 168.76,
      labor_hours: { [LEAD]: 1 },
    }),
    line({
      kind: "expense",
      package_id: null,
      unit_label: "each",
      quantity: 1,
      unit_rate: 50,
      amount: 50,
      labor_hours: {},
    }),
  ];
  it("sums the draw per class across lines and quantities", () => {
    expect(estimateDraw(lines)).toEqual({ [LEAD]: 14, [STUDENT]: 20 });
  });
  it("totals by kind", () => {
    expect(estimateTotals(lines)).toEqual({
      total: 1818.76,
      packages: 1600,
      labor: 168.76,
      expenses: 50,
    });
  });
  it("records the delta from the $500 webcast convention only when there is a webcast", () => {
    expect(legacyRateDelta(lines)).toBe(1818.76 - 2 * LEGACY_WEBCAST_RATE);
    expect(legacyRateDelta([lines[2]!])).toBeNull();
  });
  it("names an external estimate's margin", () => {
    expect(estimateMargin(1150, 0.25)).toBe(287.5);
  });
});
