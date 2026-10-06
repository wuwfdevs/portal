import { describe, expect, it } from "vitest";
import {
  computeEconomics,
  contributedStaffHours,
  economicsColumns,
  exactAmount,
  type EconomicsCardLine,
  type EconomicsLine,
} from "./economics";
import { buildRateCard } from "./rates";
import { V01, V01_PACKAGES } from "./rates.fixture";
import { snapshotLinesForCard } from "./version-card";

// The v0.1 workbook's card, snapshotted the way the Rates tab records it, is the fixture:
// the cost figures here are the ones the workbook (and rates.test.ts) reproduce.
const card = buildRateCard(V01, V01_PACKAGES);
const snapshot: EconomicsCardLine[] = snapshotLinesForCard(card, "v").map((line) => ({
  kind: line.kind,
  package_id: line.package_id,
  labor_class_id: line.labor_class_id,
  labor_cost: line.labor_cost,
  resource_cost: line.resource_cost,
  exact_cost: line.exact_cost,
  market_floor: line.market_floor,
  historical_reference: null,
}));
const webcast = card.packages.find((p) => p.key === "webcast_basic")!;

function webcastLine(amount: number): EconomicsLine {
  return {
    id: "l1",
    kind: "package",
    label: "Basic event webcast (event)",
    unit_label: "event",
    package_id: "webcast_basic",
    labor_class_id: null,
    quantity: 1,
    amount,
    direct_cost: null,
    labor_hours: { lead: 5, student: 10 },
  };
}

describe("the card snapshot's exact costs", () => {
  it("keeps the webcast's labor and resource cost unrounded", () => {
    // 5 × $42.1875 + 10 × $16.20 = $372.9375; $79.70 live package + $325 webcast operations = $404.70.
    expect(exactAmount(webcast.laborCost)).toBe(372.9375);
    expect(exactAmount(webcast.resourceCost)).toBe(404.7);
  });
});

describe("computeEconomics — the contribution definition", () => {
  it("strategic: WUWF contributes what the partner's rate leaves uncovered", () => {
    const result = computeEconomics([webcastLine(webcast.strategicRate)], snapshot, "strategic", V01.assessmentShare);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const e = result.economics;
    expect(webcast.strategicRate).toBe(575);
    expect(e.laborCost).toBe(372.9375);
    expect(e.resourceCost).toBe(404.7);
    expect(e.fullCost).toBe(777.6375);
    expect(e.recovery).toBe(575);
    expect(e.contribution).toBe(202.6375);
    expect(e.externalMargin).toBe(0);
    expect(e.externalAssessment).toBe(0);
  });

  it("incremental: the partner pays at least the full cost, so the contribution is zero, never negative", () => {
    const result = computeEconomics([webcastLine(webcast.incrementalRate)], snapshot, "incremental", V01.assessmentShare);
    if (!result.ok) throw new Error(result.error);
    expect(webcast.incrementalRate).toBe(800);
    expect(result.economics.fullCost).toBe(777.6375);
    expect(result.economics.recovery).toBe(800);
    expect(result.economics.contribution).toBe(0);
    // The $22.36 the $25 step adds is a rounding, not a margin.
    expect(result.economics.externalMargin).toBe(0);
  });

  it("external: margin and assessment are their own lines and the contribution is zero", () => {
    const result = computeEconomics([webcastLine(webcast.externalRate)], snapshot, "external", V01.assessmentShare);
    if (!result.ok) throw new Error(result.error);
    const e = result.economics;
    expect(webcast.externalRate).toBe(1150);
    expect(e.recovery).toBe(1150);
    expect(e.externalAssessment).toBe(exactAmount(1150 * 0.0671)); // 77.165
    expect(e.externalMargin).toBe(exactAmount(1150 - 77.165 - 777.6375)); // 295.1975
    expect(e.contribution).toBe(0);
    expect(e.fullCost).toBe(777.6375);
  });

  it("an external price below cost is a contribution, not a negative margin", () => {
    const result = computeEconomics([webcastLine(700)], snapshot, "external", V01.assessmentShare);
    if (!result.ok) throw new Error(result.error);
    expect(result.economics.externalMargin).toBe(0);
    expect(result.economics.contribution).toBe(exactAmount(777.6375 - 700));
  });
});

describe("computeEconomics — the other line kinds", () => {
  const expense: EconomicsLine = {
    id: "e",
    kind: "expense",
    label: "Travel",
    unit_label: "each",
    package_id: null,
    labor_class_id: null,
    quantity: 2,
    amount: 213.42, // 2 × $100 at cost plus the 6.71% assessment, as an outside partner pays
    direct_cost: 100,
    labor_hours: {},
  };
  const hours: EconomicsLine = {
    id: "h",
    kind: "labor",
    label: "Production lead hours",
    unit_label: "hour",
    package_id: null,
    labor_class_id: "lead",
    quantity: 2,
    amount: 84.38,
    direct_cost: null,
    labor_hours: { lead: 1 },
  };

  it("counts an expense at its typed cost, not the rate derived from it", () => {
    const result = computeEconomics([expense], snapshot, "external", V01.assessmentShare);
    if (!result.ok) throw new Error(result.error);
    expect(result.economics.directExpenses).toBe(200);
    expect(result.economics.fullCost).toBe(200);
    expect(result.economics.recovery).toBe(213.42);
    expect(result.economics.externalAssessment).toBe(exactAmount(200 * 0.0671)); // 13.42
    expect(result.economics.externalMargin).toBe(0);
    expect(result.economics.contribution).toBe(0);
  });

  it("prices labor hours at the class's exact loaded hourly cost", () => {
    const result = computeEconomics([hours], snapshot, "incremental", V01.assessmentShare);
    if (!result.ok) throw new Error(result.error);
    expect(result.economics.laborCost).toBe(exactAmount(2 * 42.1875));
    expect(result.economics.contribution).toBe(exactAmount(Math.max(0, 84.375 - 84.38)));
  });

  it("totals several lines and carries a benchmark for each package", () => {
    const result = computeEconomics([webcastLine(575), expense, hours], snapshot, "incremental", 0.0671);
    if (!result.ok) throw new Error(result.error);
    expect(result.economics.lines).toHaveLength(3);
    expect(result.economics.benchmarks).toEqual([
      {
        packageId: "webcast_basic",
        label: "Basic event webcast (event)",
        floor: 1000,
        ceiling: null,
        reference: null,
        rate: 575,
      },
    ]);
    const cols = economicsColumns(result.economics);
    expect(cols.full_economic_cost).toBe(
      exactAmount(777.6375 + 200 + 2 * 42.1875),
    );
  });
});

describe("computeEconomics — stale or missing cards", () => {
  it("says so rather than guessing when the snapshot predates exact costs", () => {
    const stale = snapshot.map((line) => ({ ...line, labor_cost: null, resource_cost: null }));
    const result = computeEconomics([webcastLine(575)], stale, "strategic", 0.0671);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/record it again/);
  });
  it("reports a package not on the card", () => {
    expect(
      computeEconomics([{ ...webcastLine(575), package_id: "gone" }], snapshot, "strategic", 0.0671).ok,
    ).toBe(false);
  });
});

describe("contributedStaffHours", () => {
  it("is the hours of the classes a strategic price does not charge", () => {
    expect(
      contributedStaffHours(
        [{ quantity: 2, labor_hours: { lead: 5, student: 10 } }],
        [
          { id: "lead", charged_in_strategic: false },
          { id: "student", charged_in_strategic: true },
        ],
      ),
    ).toBe(10);
  });
});
