import { describe, expect, it } from "vitest";
import {
  adoptionGate,
  buildRateCard,
  computeDerived,
  defaultSensitivityMoves,
  formatDollars,
  formatShare,
  modelFromRows,
  packageSpecFromRow,
  roundCents,
  roundUpTo,
  sensitivity,
  type LaborClassInput,
  type PackageSpec,
  type PoolInput,
  type RateModelInputs,
} from "./rates";

// The fixture is WUWF_Production_Rate_Model_v0.1.xlsx, read from the
// workbook itself (Inputs & Assumptions, Resource Pools, Service Packages,
// Rate Card sheets), in slice 2b's shape: the workbook's one professional and
// one student are two labor classes, its four pools plus webcasting are five
// pools. The same values are what
// 20261005160000_bookings_labor_and_pools.sql seeds as version v0.1.

const LEAD: LaborClassInput = {
  id: "lead",
  key: "production_lead",
  name: "Production lead",
  payBasis: "salaried",
  annualSalary: 65000,
  hourlyWage: null,
  loadShare: 0.35,
  paidHours: 2080,
  externalRate: 65,
  chargedInStrategic: false,
};

const STUDENT: LaborClassInput = {
  id: "student",
  key: "student",
  name: "Student / OPS",
  payBasis: "hourly",
  annualSalary: null,
  hourlyWage: 15,
  loadShare: 0.08,
  paidHours: null,
  externalRate: 25,
  chargedInStrategic: true,
};

function pool(
  id: string,
  name: string,
  unitLabel: string,
  share: number | null,
  units: number,
  ownLines: number[] = [],
): PoolInput {
  return {
    id,
    key: id,
    name,
    unitLabel,
    costing: share === null ? "own_lines" : "allocated",
    allocationShare: share,
    availableUnits: units,
    ownLines,
  };
}

export const V01: RateModelInputs = {
  externalMarginShare: 0.25,
  assessmentShare: 0.0671,
  // Broadcast/production equipment contingency, editing computer & accessories,
  // software acquisitions & upgrades, hardware, Adobe Creative Cloud.
  sharedPoolLines: [7000, 3200, 2000, 2000, 1740],
  labor: [LEAD, STUDENT],
  pools: [
    pool("studio", "Studio / control room", "half-day", 0.35, 120),
    pool("field", "Field video package", "day", 0.25, 80),
    pool("live", "Live / multicamera package", "day", 0.3, 60),
    pool("edit", "Edit suite / post-production", "hour", 0.1, 400),
    // The webcasting operating pool, allocated over the planning volume.
    pool("webcast", "Webcast operations", "event", null, 20, [6500]),
  ],
};

function pkg(
  key: string,
  name: string,
  unitLabel: string,
  pro: number,
  student: number,
  units: [studio: number, field: number, live: number, edit: number, webcast: number],
  floor: number,
): PackageSpec {
  return {
    key,
    name,
    unitLabel,
    labor: { lead: pro, student },
    resources: {
      studio: units[0],
      field: units[1],
      live: units[2],
      edit: units[3],
      webcast: units[4],
    },
    marketFloor: floor,
  };
}

export const V01_PACKAGES: PackageSpec[] = [
  pkg("studio_half", "Studio access", "half-day", 1, 2, [1, 0, 0, 0, 0], 250),
  pkg("studio_full", "Studio access", "full day", 2, 3, [2, 0, 0, 0, 0], 450),
  pkg("webcast_basic", "Basic event webcast", "event", 5, 10, [0, 0, 1, 0, 1], 1000),
  pkg("webcast_enhanced", "Enhanced multicamera webcast", "event", 8, 32, [1, 0, 1.5, 0, 1], 1800),
  pkg("field_half", "Field production", "half-day", 4, 8, [0, 0.5, 0, 0, 0], 500),
  pkg("field_full", "Field production", "full day", 8, 16, [0, 1, 0, 0, 0], 900),
  pkg("editing_hour", "Post-production / editing", "hour", 1, 0, [0, 0, 0, 1, 0], 75),
];

describe("derived labor and pool metrics (Inputs & Assumptions sheet)", () => {
  const derived = computeDerived(V01);
  const byId = Object.fromEntries(derived.pools.map((p) => [p.id, p]));

  it("reproduces the loaded hourly costs", () => {
    expect(roundCents(derived.labor.find((l) => l.id === "lead")!.loadedHourly)).toBe(42.19);
    expect(roundCents(derived.labor.find((l) => l.id === "student")!.loadedHourly)).toBe(16.2);
  });

  it("sums the shared pool and allocates it per pool", () => {
    expect(derived.sharedPoolAnnual).toBe(15940);
    expect(byId.studio!.annualCost).toBeCloseTo(5579, 2);
    expect(byId.field!.annualCost).toBeCloseTo(3985, 2);
    expect(byId.live!.annualCost).toBeCloseTo(4782, 2);
    expect(byId.edit!.annualCost).toBeCloseTo(1594, 2);
    expect(roundCents(byId.studio!.costPerUnit)).toBe(46.49);
    expect(roundCents(byId.field!.costPerUnit)).toBe(49.81);
    expect(roundCents(byId.live!.costPerUnit)).toBe(79.7);
    expect(roundCents(byId.edit!.costPerUnit)).toBe(3.99);
  });

  it("costs an own-lines pool from its own lines over its volume (webcast ops per event)", () => {
    expect(byId.webcast!.annualCost).toBe(6500);
    expect(byId.webcast!.costPerUnit).toBe(325);
  });
});

describe("service package costs (Service Packages sheet, whole dollars)", () => {
  const card = buildRateCard(V01, V01_PACKAGES);
  const byKey = Object.fromEntries(card.packages.map((line) => [line.key, line]));

  it.each([
    ["studio_half", 79, 121],
    ["studio_full", 142, 226],
    ["webcast_basic", 567, 778],
    ["webcast_enhanced", 1009, 1347],
    ["field_half", 155, 323],
    ["field_full", 309, 647],
    ["editing_hour", 4, 46],
  ])("%s costs strategic $%i / incremental $%i", (key, strategic, incremental) => {
    expect(Math.round(byKey[key]!.strategicCost)).toBe(strategic);
    expect(Math.round(byKey[key]!.incrementalCost)).toBe(incremental);
  });

  it("keeps cents on the costs", () => {
    expect(byKey.studio_half!.strategicCost).toBe(78.89);
    expect(byKey.studio_half!.incrementalCost).toBe(121.08);
    expect(byKey.webcast_enhanced!.strategicCost).toBe(1009.44);
    expect(byKey.field_full!.strategicCost).toBe(309.01);
  });

  it("charges a class's hours in the strategic price only when the class says so", () => {
    const charged = buildRateCard(
      { ...V01, labor: [{ ...LEAD, chargedInStrategic: true }, STUDENT] },
      [V01_PACKAGES[0]!],
    ).packages[0]!;
    // With the lead charged too, strategic equals incremental.
    expect(charged.strategicCost).toBe(charged.incrementalCost);
  });
});

describe("the rate card (Rate Card sheet)", () => {
  const card = buildRateCard(V01, V01_PACKAGES);
  const byKey = Object.fromEntries(card.packages.map((line) => [line.key, line]));

  it.each([
    ["studio_half", 100, 125, 250],
    ["studio_full", 150, 250, 450],
    ["webcast_basic", 575, 800, 1150],
    ["webcast_enhanced", 1025, 1350, 1975],
    ["field_half", 175, 325, 500],
    ["field_full", 325, 650, 950],
    ["editing_hour", 25, 50, 75],
  ])("%s prints $%i / $%i / $%i", (key, strategic, incremental, external) => {
    expect(byKey[key]!.strategicRate).toBe(strategic);
    expect(byKey[key]!.incrementalRate).toBe(incremental);
    expect(byKey[key]!.externalRate).toBe(external);
  });

  it("takes the market floor when the grossed-up cost is lower, and the cost when higher", () => {
    expect(byKey.studio_half!.externalGrossedCost).toBeLessThan(250);
    expect(byKey.studio_half!.externalRate).toBe(250);
    expect(byKey.webcast_enhanced!.externalGrossedCost).toBeGreaterThan(1800);
    expect(byKey.webcast_enhanced!.externalRate).toBe(1975);
  });

  it("lists one labor line per class with the loaded internal cost and the typed external rate", () => {
    expect(card.labor.map((line) => [line.key, line.internalRate, line.externalRate])).toEqual([
      ["production_lead", 42.19, 65],
      ["student", 16.2, 25],
    ]);
    expect(card.labor[0]!.name).toBe("Production lead beyond the envelope");
    expect(card.labor[1]!.name).toBe("Student / OPS labor");
  });
});

describe("rounding", () => {
  it("rounds up to the next $25, leaving a figure already on the step alone", () => {
    expect(roundUpTo(78.89)).toBe(100);
    expect(roundUpTo(100)).toBe(100);
    expect(roundUpTo(100.01)).toBe(125);
    expect(roundUpTo(3.99)).toBe(25);
    expect(roundUpTo(0)).toBe(0);
  });

  it("rounds to cents without float drift", () => {
    expect(roundCents(154.505)).toBe(154.51);
    expect(roundCents(1.005)).toBe(1.01);
  });
});

describe("sensitivity", () => {
  it("builds a move per class figure and per own-lines pool", () => {
    expect(defaultSensitivityMoves(V01).map((move) => move.label)).toEqual([
      "Production lead load",
      "Production lead salary",
      "Student / OPS load",
      "Student / OPS wage",
      "Webcast operations volume",
    ]);
  });

  it("ranks the moves by their largest effect and reports per-package deltas", () => {
    const rows = sensitivity(V01, V01_PACKAGES);
    expect(rows.length).toBe(5);
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index - 1]!.largest).toBeGreaterThanOrEqual(rows[index]!.largest);
    }
    const fringe = rows.find(
      (row) => row.move.kind === "labor_load" && row.move.targetId === "lead",
    )!;
    // +10 points of fringe adds $65,000 × 0.1 ÷ 2,080 = $3.125 per professional hour;
    // the enhanced webcast draws 8 of them, the basic one 5 (the delta is
    // between two costs already rounded to cents, so $15.625 reads $15.62).
    expect(fringe.deltas.webcast_enhanced).toBe(25);
    expect(fringe.deltas.webcast_basic).toBe(15.62);
  });

  it("drops a move the model can't price rather than throwing", () => {
    const rows = sensitivity(V01, V01_PACKAGES, [
      { kind: "pool_units", targetId: "webcast", label: "x", delta: -20, moveLabel: "−20" },
    ]);
    expect(rows).toEqual([]);
  });
});

describe("adoption gate", () => {
  it("is ready only when nothing is pending; accepted as is counts as resolved", () => {
    expect(
      adoptionGate([
        { validationState: "validated" },
        { validationState: "accepted_as_is" },
        { validationState: "pending" },
      ]),
    ).toEqual({ total: 3, pending: 1, ready: false });
    expect(adoptionGate([])).toEqual({ total: 0, pending: 0, ready: true });
  });
});

describe("modelFromRows", () => {
  const rows = {
    assumptions: [
      ...V01.sharedPoolLines.map((value) => ({
        kind: "pool_line" as const,
        key: null,
        pool_id: null,
        value,
      })),
      { kind: "pool_line" as const, key: null, pool_id: "webcast", value: 6500 },
      { kind: "model_input" as const, key: "external_margin_share", pool_id: null, value: 0.25 },
      { kind: "model_input" as const, key: "assessment_share", pool_id: null, value: 0.0671 },
    ],
    classes: V01.labor.map((labor) => ({
      id: labor.id,
      key: labor.key,
      name: labor.name,
      pay_basis: labor.payBasis,
      charged_in_strategic: labor.chargedInStrategic,
      active: true,
    })),
    laborRates: V01.labor.map((labor) => ({
      labor_class_id: labor.id,
      annual_salary: labor.annualSalary,
      hourly_wage: labor.hourlyWage,
      load_share: labor.loadShare,
      paid_hours: labor.paidHours,
      external_rate: labor.externalRate,
    })),
    poolCatalog: V01.pools.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      unit_label: p.unitLabel,
      costing: p.costing,
      active: true,
    })),
    pools: V01.pools.map((p) => ({
      pool_id: p.id,
      allocation_share: p.allocationShare,
      available_units: p.availableUnits,
    })),
  };

  it("rebuilds the model from stored rows", () => {
    const result = modelFromRows(rows);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.model).toEqual(V01);
  });

  it("names what a half-built draft is missing, in words", () => {
    const result = modelFromRows({
      ...rows,
      assumptions: rows.assumptions.filter((row) => row.key !== "assessment_share"),
      laborRates: rows.laborRates.filter((row) => row.labor_class_id !== "student"),
      pools: rows.pools.filter((row) => row.pool_id !== "edit"),
    });
    expect(result).toEqual({
      ok: false,
      missing: [
        "New Ventures administrative assessment",
        "Student / OPS pay figures",
        "Edit suite / post-production pool",
      ],
    });
  });

  it("does not require figures for a retired class or pool, but prices one that has them", () => {
    const retired = modelFromRows({
      ...rows,
      classes: rows.classes.map((cls) => (cls.id === "student" ? { ...cls, active: false } : cls)),
      laborRates: rows.laborRates.filter((row) => row.labor_class_id !== "student"),
    });
    expect(retired.ok).toBe(true);
    if (retired.ok) expect(retired.model.labor.map((l) => l.id)).toEqual(["lead"]);
  });

  it("maps a package row with its child rows onto a spec", () => {
    expect(
      packageSpecFromRow({
        id: "p1",
        name: "Field production",
        unit_label: "half-day",
        market_floor: 500,
        active: true,
        labor: [
          { labor_class_id: "lead", hours: 4 },
          { labor_class_id: "student", hours: 8 },
        ],
        resources: [{ pool_id: "field", units: 0.5 }],
      }),
    ).toEqual({
      key: "p1",
      name: "Field production",
      unitLabel: "half-day",
      labor: { lead: 4, student: 8 },
      resources: { field: 0.5 },
      marketFloor: 500,
    });
  });
});

describe("formatting", () => {
  it("prints whole dollars without cents and cents when they matter", () => {
    expect(formatDollars(1150)).toBe("$1,150");
    expect(formatDollars(46.17)).toBe("$46.17");
    expect(formatDollars(16.2, { cents: true })).toBe("$16.20");
  });

  it("prints shares as percentages", () => {
    expect(formatShare(0.35)).toBe("35%");
    expect(formatShare(0.0671)).toBe("6.71%");
    expect(formatShare(0.08)).toBe("8%");
  });
});
