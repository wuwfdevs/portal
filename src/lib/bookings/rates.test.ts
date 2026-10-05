import { describe, expect, it } from "vitest";
import {
  adoptionGate,
  buildRateCard,
  computeDerived,
  formatDollars,
  formatShare,
  modelFromRows,
  packageSpecFromRow,
  roundCents,
  roundUpTo,
  sensitivity,
  type PackageSpec,
  type RateModelInputs,
} from "./rates";

// The fixture is WUWF_Production_Rate_Model_v0.1.xlsx, read from the
// workbook itself (Inputs & Assumptions, Resource Pools, Service Packages,
// Rate Card sheets). The same values are what
// 20261005140000_bookings_foundation.sql seeds as version v0.1.

export const V01: RateModelInputs = {
  inputs: {
    pro_salary: 65000,
    pro_fringe_share: 0.35,
    paid_hours: 2080,
    student_wage: 15,
    student_load_share: 0.08,
    external_margin_share: 0.25,
    assessment_share: 0.0671,
    baseline_share: 0.15,
    net_capacity_days: 100,
    webcast_volume: 20,
    student_external_rate: 25,
    pro_external_rate: 65,
  },
  // Broadcast/production equipment contingency, editing computer & accessories,
  // software acquisitions & upgrades, hardware, Adobe Creative Cloud.
  sharedPoolLines: [7000, 3200, 2000, 2000, 1740],
  webcastPoolLines: [6500],
  pools: {
    studio: { allocationShare: 0.35, availableUnits: 120, unitLabel: "half-day" },
    field: { allocationShare: 0.25, availableUnits: 80, unitLabel: "day" },
    live: { allocationShare: 0.3, availableUnits: 60, unitLabel: "day" },
    edit: { allocationShare: 0.1, availableUnits: 400, unitLabel: "hour" },
  },
};

function pkg(
  key: string,
  name: string,
  unitLabel: string,
  pro: number,
  student: number,
  units: [studio: number, field: number, live: number, edit: number],
  ops: number,
  floor: number,
): PackageSpec {
  return {
    key,
    name,
    unitLabel,
    professionalHours: pro,
    studentHours: student,
    units: { studio: units[0], field: units[1], live: units[2], edit: units[3] },
    webcastOpsUnits: ops,
    marketFloor: floor,
  };
}

export const V01_PACKAGES: PackageSpec[] = [
  pkg("studio_half", "Studio access", "half-day", 1, 2, [1, 0, 0, 0], 0, 250),
  pkg("studio_full", "Studio access", "full day", 2, 3, [2, 0, 0, 0], 0, 450),
  pkg("webcast_basic", "Basic event webcast", "event", 5, 10, [0, 0, 1, 0], 1, 1000),
  pkg("webcast_enhanced", "Enhanced multicamera webcast", "event", 8, 32, [1, 0, 1.5, 0], 1, 1800),
  pkg("field_half", "Field production", "half-day", 4, 8, [0, 0.5, 0, 0], 0, 500),
  pkg("field_full", "Field production", "full day", 8, 16, [0, 1, 0, 0], 0, 900),
  pkg("editing_hour", "Post-production / editing", "hour", 1, 0, [0, 0, 0, 1], 0, 75),
];

describe("derived labor and pool metrics (Inputs & Assumptions sheet)", () => {
  const derived = computeDerived(V01);

  it("reproduces the loaded hourly costs", () => {
    expect(roundCents(derived.proLoadedHourly)).toBe(42.19);
    expect(roundCents(derived.studentLoadedHourly)).toBe(16.2);
  });

  it("sums the shared pool and allocates it per pool", () => {
    expect(derived.sharedPoolAnnual).toBe(15940);
    expect(derived.pools.studio.annualCost).toBeCloseTo(5579, 2);
    expect(derived.pools.field.annualCost).toBeCloseTo(3985, 2);
    expect(derived.pools.live.annualCost).toBeCloseTo(4782, 2);
    expect(derived.pools.edit.annualCost).toBeCloseTo(1594, 2);
    expect(roundCents(derived.pools.studio.costPerUnit)).toBe(46.49);
    expect(roundCents(derived.pools.field.costPerUnit)).toBe(49.81);
    expect(roundCents(derived.pools.live.costPerUnit)).toBe(79.7);
    expect(roundCents(derived.pools.edit.costPerUnit)).toBe(3.99);
  });

  it("allocates webcast operations per event and the baseline reserve in days", () => {
    expect(derived.webcastOpsPerEvent).toBe(325);
    expect(derived.baselineCapacityDays).toBe(15);
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
    // Studio half-day: $121.08 ÷ (1 − 25% − 6.71%) ≈ $177, under the $250 floor.
    expect(byKey.studio_half!.externalGrossedCost).toBeLessThan(250);
    expect(byKey.studio_half!.externalRate).toBe(250);
    // Enhanced webcast: ≈ $1,972, over the $1,800 floor, rounds up to $1,975.
    expect(byKey.webcast_enhanced!.externalGrossedCost).toBeGreaterThan(1800);
    expect(byKey.webcast_enhanced!.externalRate).toBe(1975);
  });

  it("lists the labor lines with the loaded internal cost and the typed external rate", () => {
    expect(card.labor.map((line) => [line.key, line.internalRate, line.externalRate])).toEqual([
      ["student_labor", 16.2, 25],
      ["professional_labor", 42.19, 65],
    ]);
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
  it("ranks the moves by their largest effect and reports per-package deltas", () => {
    const rows = sensitivity(V01, V01_PACKAGES);
    expect(rows.length).toBeGreaterThan(0);
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index - 1]!.largest).toBeGreaterThanOrEqual(rows[index]!.largest);
    }
    const fringe = rows.find((row) => row.move.key === "pro_fringe_share")!;
    // +10 points of fringe adds $65,000 × 0.1 ÷ 2,080 = $3.125 per professional hour;
    // the enhanced webcast draws 8 of them, the basic one 5 (the delta is
    // between two costs already rounded to cents, so $15.625 reads $15.62).
    expect(fringe.deltas.webcast_enhanced).toBe(25);
    expect(fringe.deltas.webcast_basic).toBe(15.62);
  });

  it("drops a move the model can't price rather than throwing", () => {
    const rows = sensitivity(V01, V01_PACKAGES, [
      { key: "webcast_volume", label: "x", delta: -20, moveLabel: "−20" },
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
    expect(adoptionGate([{ validationState: "validated" }])).toEqual({
      total: 1,
      pending: 0,
      ready: true,
    });
    expect(adoptionGate([])).toEqual({ total: 0, pending: 0, ready: true });
  });
});

describe("modelFromRows", () => {
  const assumptions = [
    ...V01.sharedPoolLines.map((value) => ({
      key: null,
      kind: "shared_pool_line" as const,
      value,
    })),
    ...V01.webcastPoolLines.map((value) => ({
      key: null,
      kind: "webcast_pool_line" as const,
      value,
    })),
    ...Object.entries(V01.inputs).map(([key, value]) => ({
      key,
      kind: "model_input" as const,
      value,
    })),
  ];
  const pools = (["studio", "field", "live", "edit"] as const).map((pool) => ({
    pool,
    allocation_share: V01.pools[pool].allocationShare,
    available_units: V01.pools[pool].availableUnits,
    unit_label: V01.pools[pool].unitLabel,
  }));

  it("rebuilds the model from stored rows", () => {
    const result = modelFromRows(assumptions, pools);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.model).toEqual(V01);
  });

  it("names what a half-built draft is missing", () => {
    const result = modelFromRows(
      assumptions.filter((row) => row.key !== "paid_hours"),
      pools.filter((row) => row.pool !== "edit"),
    );
    expect(result).toEqual({ ok: false, missing: ["paid_hours"], missingPools: ["edit"] });
  });

  it("maps a package row onto a spec", () => {
    expect(
      packageSpecFromRow({
        id: "p1",
        name: "Field production",
        unit_label: "half-day",
        professional_hours: 4,
        student_hours: 8,
        studio_units: 0,
        field_units: 0.5,
        live_units: 0,
        edit_hours: 0,
        webcast_ops_units: 0,
        market_floor: 500,
        active: true,
      }),
    ).toEqual(V01_PACKAGES[4]!.key === "field_half" ? { ...V01_PACKAGES[4]!, key: "p1" } : null);
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
