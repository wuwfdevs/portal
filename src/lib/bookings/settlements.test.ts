import { describe, expect, it } from "vitest";
import { economicsColumns } from "./economics";
import { roundCents } from "./rates";
import { V01 } from "./rates.fixture";
import {
  draftSettlement,
  hoursConfirmed,
  settledSummary,
  settlementColumns,
  settlementKindFor,
  settlementState,
  validatePosting,
  type SettlementInputs,
  type SettlementLine,
} from "./settlements";

// The v0.1 Basic event webcast (docs/bookings-design.md §19.1): 5 professional hours at
// $42.1875 and 10 student hours at $16.20, a live package at $79.70 and webcast operations
// at $325 — a full economic cost of $777.6375.
const unitCosts = {
  labor: [
    { id: "lead", name: "Professional", hourly: 42.1875 },
    { id: "student", name: "Student", hourly: 16.2 },
  ],
  pools: [
    { id: "live", name: "Live package", perUnit: 79.7 },
    { id: "webcast", name: "Webcast operations", perUnit: 325 },
  ],
};

function webcast(amount: number): SettlementLine {
  return {
    id: "l1",
    kind: "package",
    package_id: "webcast_basic",
    label: "Basic event webcast",
    quantity: 1,
    amount,
    direct_cost: null,
    labor_hours: { lead: 5, student: 10 },
    resource_units: { live: 1, webcast: 1 },
    recipe_labor_hours: { lead: 5, student: 10 },
    recipe_resource_units: { live: 1, webcast: 1 },
  };
}

function expense(amount: number, cost: number): SettlementLine {
  return {
    id: "x1",
    kind: "expense",
    package_id: null,
    label: "Travel",
    quantity: 1,
    amount,
    direct_cost: cost,
    labor_hours: {},
    resource_units: {},
    recipe_labor_hours: null,
    recipe_resource_units: null,
  };
}

const asPlanned = [
  { kind: "labor" as const, id: "lead", planned: 5, used: 5 },
  { kind: "labor" as const, id: "student", planned: 10, used: 10 },
  { kind: "units" as const, id: "live", planned: 1, used: 1 },
  { kind: "units" as const, id: "webcast", planned: 1, used: 1 },
];

function inputs(overrides: Partial<SettlementInputs> = {}): SettlementInputs {
  return {
    partnerKind: "uwf_unit",
    treatment: "strategic",
    lines: [webcast(575)],
    confirmed: asPlanned,
    unitCosts,
    assessmentShare: V01.assessmentShare,
    estimatedFullCost: 777.6375,
    estimatedContribution: 202.6375,
    ...overrides,
  };
}

function figures(input: SettlementInputs) {
  const result = draftSettlement(input);
  if (!result.ok) throw new Error(result.error);
  return result.figures;
}

describe("settlementKindFor", () => {
  it("recharges a UWF unit and invoices an outside partner", () => {
    expect(settlementKindFor("uwf_unit")).toBe("recharge");
    expect(settlementKindFor("external")).toBe("invoice");
  });
});

describe("draftSettlement — confirmed as planned", () => {
  it("reproduces the estimate: strategic costs $777.6375, charges $575 and WUWF contributes $202.6375", () => {
    const f = figures(inputs());
    expect(f.kind).toBe("recharge");
    expect(f.laborCost).toBe(372.9375);
    expect(f.resourceCost).toBe(404.7);
    expect(f.fullCost).toBe(777.6375);
    expect(f.amount).toBe(575);
    expect(f.contribution).toBe(202.6375);
    expect(f.costVariance).toBe(0);
    expect(f.assessment).toBe(0);
    expect(f.margin).toBe(0);
  });

  it("incremental: the partner's payment covers the cost, so the contribution is zero, never negative", () => {
    const f = figures(inputs({ treatment: "incremental", lines: [webcast(800)] }));
    expect(f.amount).toBe(800);
    expect(f.contribution).toBe(0);
    expect(f.margin).toBe(0);
  });

  it("external: an invoice with the assessment and margin on their own lines", () => {
    const f = figures(
      inputs({ partnerKind: "external", treatment: "external", lines: [webcast(1150)] }),
    );
    expect(f.kind).toBe("invoice");
    expect(f.amount).toBe(1150);
    // docs/bookings-design.md §19.1: assessment $77.165, margin $295.1975.
    expect(f.assessment).toBeCloseTo(77.165, 6);
    expect(f.margin).toBeCloseTo(295.1975, 6);
    expect(f.contribution).toBe(0);
  });
});

describe("draftSettlement — actual cost", () => {
  it("costs the hours confirmed, not the hours planned", () => {
    const f = figures(
      inputs({
        confirmed: [
          { kind: "labor", id: "lead", planned: 5, used: 7 },
          { kind: "labor", id: "student", planned: 10, used: 10 },
          { kind: "units", id: "live", planned: 1, used: 1 },
          { kind: "units", id: "webcast", planned: 1, used: 1 },
        ],
      }),
    );
    // Two more professional hours: $84.375 over the estimate, and WUWF carries it.
    expect(f.laborCost).toBe(457.3125);
    expect(f.fullCost).toBe(862.0125);
    expect(f.costVariance).toBe(84.375);
    expect(f.amount).toBe(575);
    expect(f.contribution).toBe(287.0125);
  });

  it("never lets the price follow the hours: the amount is the approved estimate's", () => {
    const less = figures(
      inputs({
        confirmed: asPlanned.map((f) => (f.id === "student" ? { ...f, used: 4 } : f)),
      }),
    );
    expect(less.amount).toBe(575);
    expect(less.fullCost).toBeLessThan(777.6375);
  });

  it("charges a direct expense at its actual cost, and the assessment on it when external", () => {
    const lines = [webcast(575), expense(200, 200)];
    const internal = figures(inputs({ lines, expenseActuals: { x1: 150 } }));
    expect(internal.expenses).toEqual([
      { lineId: "x1", label: "Travel", estimatedCost: 200, actualCost: 150, billed: 150 },
    ]);
    expect(internal.amount).toBe(725);
    expect(internal.directCost).toBe(150);
    expect(internal.fullCost).toBe(927.6375);

    const outside = figures(
      inputs({
        partnerKind: "external",
        treatment: "external",
        lines: [webcast(1150), expense(roundCents(200 * (1 + V01.assessmentShare)), 200)],
        expenseActuals: { x1: 150 },
      }),
    );
    const billed = roundCents(150 * (1 + V01.assessmentShare));
    expect(outside.expenses[0]!.billed).toBe(billed);
    expect(outside.amount).toBe(roundCents(1150 + billed));
    expect(outside.assessment).toBeCloseTo((1150 + 150) * V01.assessmentShare, 6);
  });

  it("settles an expense as estimated when Finance has typed nothing", () => {
    const f = figures(inputs({ lines: [webcast(575), expense(200, 200)] }));
    expect(f.amount).toBe(775);
    expect(f.directCost).toBe(200);
  });

  it("refuses a negative or non-numeric actual expense", () => {
    const result = draftSettlement(
      inputs({ lines: [webcast(575), expense(200, 200)], expenseActuals: { x1: -1 } }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("hours confirmed first", () => {
  it("won't draft until production has confirmed every planned class and pool", () => {
    const result = draftSettlement(inputs({ confirmed: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/confirmed/);
    expect(hoursConfirmed([webcast(575)], asPlanned.slice(0, 3))).toBe(false);
    expect(hoursConfirmed([webcast(575)], asPlanned)).toBe(true);
  });

  it("has nothing to wait on when the estimate planned no hours or equipment", () => {
    expect(hoursConfirmed([expense(200, 200)], [])).toBe(true);
  });

  it("reports a class or pool the rate card recorded no cost for", () => {
    const result = draftSettlement(
      inputs({ unitCosts: { ...unitCosts, labor: unitCosts.labor.slice(0, 1) } }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("settlementState", () => {
  const lines = [webcast(575)];
  it("walks waiting → ready → drafted → posted", () => {
    expect(settlementState(lines, [], null)).toBe("awaiting_hours");
    expect(settlementState(lines, asPlanned, null)).toBe("ready_to_draft");
    expect(settlementState(lines, asPlanned, { status: "drafted" })).toBe("drafted");
    expect(settlementState(lines, asPlanned, { status: "posted" })).toBe("posted");
  });
});

describe("validatePosting", () => {
  it("needs a journal entry, and a funding index for a recharge", () => {
    expect(validatePosting("invoice", "", "")).toMatch(/journal entry/);
    expect(validatePosting("recharge", "JE-1", "")).toMatch(/funding index/);
    expect(validatePosting("recharge", "JE-1", "12-3456")).toBeNull();
    expect(validatePosting("invoice", "JE-1", "")).toBeNull();
  });
});

describe("settlementColumns", () => {
  it("writes the figures under the table's column names", () => {
    const f = figures(inputs());
    const columns = settlementColumns(f, {
      expenseActuals: {},
      estimatedFullCost: 777.6375,
      estimatedContribution: 202.6375,
      rateModelVersionId: "v",
      fundingIndex: "12-3456",
      notes: null,
    });
    expect(columns).toMatchObject({
      kind: "recharge",
      amount: 575,
      actual_full_cost: 777.6375,
      wuwf_contribution: 202.6375,
      funding_index: "12-3456",
    });
  });

  it("agrees with the estimate's own economics when nothing differed", () => {
    // The estimate stored 777.6375 / 202.6375 (economicsColumns); settling as planned lands on the same.
    const f = figures(inputs());
    const estimate = economicsColumns({
      laborCost: 372.9375,
      resourceCost: 404.7,
      directExpenses: 0,
      fullCost: 777.6375,
      recovery: 575,
      contribution: 202.6375,
      externalMargin: 0,
      externalAssessment: 0,
      lines: [],
      benchmarks: [],
    });
    expect(f.fullCost).toBe(estimate.full_economic_cost);
    expect(f.contribution).toBe(estimate.wuwf_contribution);
  });
});

describe("settledSummary", () => {
  const row = (over: Partial<Parameters<typeof settledSummary>[0][number]> = {}) => ({
    id: "p",
    title: "t",
    partner_name: "UWF",
    kind: "recharge" as const,
    amount: 575,
    estimated_recovery: 575,
    estimated_full_cost: 777.6375,
    estimated_contribution: 202.6375,
    actual_full_cost: 862.0125,
    wuwf_contribution: 287.0125,
    assessment_amount: 0,
    external_margin: 0,
    ...over,
  });

  it("totals actual against estimated for the projects that had a modeled cost", () => {
    const s = settledSummary([
      row(),
      row({ estimated_full_cost: null, estimated_contribution: null }),
    ]);
    expect(s.count).toBe(2);
    expect(s.amount).toBe(1150);
    expect(s.actualFullCost).toBe(1724.025);
    expect(s.comparableCount).toBe(1);
    expect(s.comparableActualCost).toBe(862.0125);
    expect(s.estimatedFullCost).toBe(777.6375);
  });

  it("is empty with nothing settled", () => {
    expect(settledSummary([]).count).toBe(0);
  });
});
