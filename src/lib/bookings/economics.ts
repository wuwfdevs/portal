// What an estimate costs WUWF and what WUWF contributes — pure, no Supabase,
// no React. docs/bookings-design.md "Definitions" and §19. The pilot exists to
// show what WUWF contributes to university work and to test the legacy $500
// webcast price against modeled cost, so every estimate stores:
//
//   full economic cost = modeled labor + modeled resources + direct expenses
//                        (no margin, no assessment, no overhead)
//   partner recovery   = what the partner pays
//   WUWF contribution  = max(0, full cost − recovery)
//   external margin / assessment = shown on their own lines, external only,
//                        never a negative contribution
//   market benchmark   = floor, ceiling and reference as they stood when priced
//
// Costs are exact (never rounded to cents or to the card's $25 step); the card's
// rounding is a pricing policy applied to the rate only (§19.1).

import type { BkEstimateLineKind, BkPricingTreatment } from "@/lib/database.types";
import { adjustedLinePrice, isAdjusted, unitCostsFromRows, type UnitCostRowLike } from "./pricing";
import type { HoursByClass } from "./scheduling";

/** Six decimals: floating-point noise out, no rounding to cents or to the card's step. */
export function exactAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export interface EconomicsLine {
  id: string;
  kind: BkEstimateLineKind;
  label: string;
  unit_label: string;
  package_id: string | null;
  labor_class_id: string | null;
  quantity: number;
  /** What the partner pays for this line. */
  amount: number;
  /** An expense line's cost each, before any assessment. */
  direct_cost: number | null;
  labor_hours: HoursByClass;
  resource_units?: Record<string, number>;
  /** The standard recipe a package line started from, and why it was adjusted (§20.6). */
  recipe_labor_hours?: HoursByClass | null;
  recipe_resource_units?: Record<string, number> | null;
  adjustment_reason?: string | null;
}

export interface EconomicsCardLine {
  kind: "package" | "labor";
  package_id: string | null;
  labor_class_id: string | null;
  /** Exact cost per unit of a package: all labor, and all resources. */
  labor_cost: number | null;
  resource_cost: number | null;
  /** A labor line's exact loaded hourly cost. */
  exact_cost: number | null;
  market_floor: number | null;
  market_ceiling?: number | null;
  historical_reference: string | null;
}

export interface MarketBenchmark {
  packageId: string;
  label: string;
  floor: number;
  ceiling: number | null;
  reference: string | null;
  /** The per-unit rate the partner is charged. */
  rate: number;
  /** An adjusted scope's floor and ceiling are the standard ones scaled to its cost (§20.6). */
  scaled?: boolean;
}

export interface LineEconomics {
  lineId: string;
  label: string;
  kind: BkEstimateLineKind;
  unitLabel: string;
  quantity: number;
  laborCost: number;
  resourceCost: number;
  directCost: number;
  /** What the partner pays for the line. */
  amount: number;
}

export interface Economics {
  laborCost: number;
  resourceCost: number;
  directExpenses: number;
  fullCost: number;
  recovery: number;
  contribution: number;
  externalMargin: number;
  externalAssessment: number;
  lines: LineEconomics[];
  benchmarks: MarketBenchmark[];
}

export type EconomicsResult = { ok: true; economics: Economics } | { ok: false; error: string };

/**
 * The economics of an estimate under a treatment. A package line's cost is the
 * card snapshot's exact labor and resource cost per unit; a labor line's is
 * the class's exact loaded hourly cost; an expense's is its typed cost. An
 * estimate priced from a snapshot written before exact costs existed reports
 * that rather than guessing (§19.4).
 */
export function computeEconomics(
  lines: readonly EconomicsLine[],
  card: readonly EconomicsCardLine[],
  treatment: BkPricingTreatment,
  assessmentShare: number,
  options: {
    /** The card snapshot's unit costs: what an adjusted line is costed from. */
    unitCosts?: readonly UnitCostRowLike[];
    externalMarginShare?: number;
  } = {},
): EconomicsResult {
  const out: LineEconomics[] = [];
  const benchmarks: MarketBenchmark[] = [];
  let labor = 0;
  let resource = 0;
  let direct = 0;
  let recovery = 0;
  let assessmentBase = 0;

  for (const line of lines) {
    const quantity = Number(line.quantity);
    const amount = Number(line.amount);
    let laborCost = 0;
    let resourceCost = 0;
    let directCost = 0;

    if (line.kind === "package") {
      const cardLine = card.find((c) => c.kind === "package" && c.package_id === line.package_id);
      if (!cardLine) return { ok: false, error: `${line.label} is not on the rate card in use.` };
      if (cardLine.labor_cost === null || cardLine.resource_cost === null) {
        return {
          ok: false,
          error: `The rate card in use was recorded before costs were kept; record it again on the Rates tab to model ${line.label}'s cost.`,
        };
      }
      let floor = Number(cardLine.market_floor ?? 0);
      let ceiling =
        cardLine.market_ceiling === null || cardLine.market_ceiling === undefined
          ? null
          : Number(cardLine.market_ceiling);
      let scaled = false;
      if (isAdjusted({ ...line, resource_units: line.resource_units ?? {} })) {
        // An adjusted scope is costed from the version's unit costs and its benchmark scaled (§20.6).
        const unitCosts = options.unitCosts ?? [];
        if (unitCosts.length === 0) {
          return {
            ok: false,
            error: `The rate card in use has no unit costs recorded; record it again on the Rates tab to model ${line.label}'s adjusted scope.`,
          };
        }
        const costs = unitCostsFromRows(unitCosts);
        for (const [classId, hours] of Object.entries(line.labor_hours)) {
          const rate = costs.labor.find((l) => l.id === classId);
          if (!rate) return { ok: false, error: `${line.label} uses a labor class the rate card has no cost for.` };
          laborCost += Number(hours) * rate.hourly * quantity;
        }
        for (const [poolId, units] of Object.entries(line.resource_units ?? {})) {
          const rate = costs.pools.find((p) => p.id === poolId);
          if (!rate) return { ok: false, error: `${line.label} uses equipment or space the rate card has no cost for.` };
          resourceCost += Number(units) * rate.perUnit * quantity;
        }
        const adjusted = adjustedLinePrice(
          { ...line, resource_units: line.resource_units ?? {} },
          cardLine,
          unitCosts,
          { externalMarginShare: options.externalMarginShare ?? 0, assessmentShare },
          line.label,
        );
        floor = adjusted.floor;
        ceiling = adjusted.ceiling;
        scaled = true;
      } else {
        laborCost = Number(cardLine.labor_cost) * quantity;
        resourceCost = Number(cardLine.resource_cost) * quantity;
      }
      benchmarks.push({
        packageId: line.package_id!,
        label: line.label,
        floor,
        ceiling,
        reference: cardLine.historical_reference,
        rate: quantity > 0 ? exactAmount(amount / quantity) : 0,
        ...(scaled ? { scaled: true } : {}),
      });
      assessmentBase += amount;
    } else if (line.kind === "labor") {
      const cardLine = card.find(
        (c) => c.kind === "labor" && c.labor_class_id === line.labor_class_id,
      );
      if (!cardLine || cardLine.exact_cost === null) {
        return { ok: false, error: `${line.label}'s cost can't be modeled from the rate card in use.` };
      }
      const hours = Object.values(line.labor_hours).reduce((total, h) => total + Number(h), 0);
      laborCost = Number(cardLine.exact_cost) * hours * quantity;
      assessmentBase += amount;
    } else {
      directCost = Number(line.direct_cost ?? 0) * quantity;
      // An expense is passed through at cost, plus the assessment on its cost (§7).
      assessmentBase += directCost;
    }

    labor += laborCost;
    resource += resourceCost;
    direct += directCost;
    recovery += amount;
    out.push({
      lineId: line.id,
      label: line.label,
      kind: line.kind,
      unitLabel: line.unit_label,
      quantity,
      laborCost: exactAmount(laborCost),
      resourceCost: exactAmount(resourceCost),
      directCost: exactAmount(directCost),
      amount,
    });
  }

  const fullCost = labor + resource + direct;
  const external = treatment === "external";
  const assessment = external ? assessmentBase * assessmentShare : 0;
  return {
    ok: true,
    economics: {
      laborCost: exactAmount(labor),
      resourceCost: exactAmount(resource),
      directExpenses: exactAmount(direct),
      fullCost: exactAmount(fullCost),
      recovery: exactAmount(recovery),
      contribution: exactAmount(Math.max(0, fullCost - recovery)),
      externalAssessment: exactAmount(assessment),
      externalMargin: exactAmount(external ? Math.max(0, recovery - assessment - fullCost) : 0),
      lines: out,
      benchmarks,
    },
  };
}

/** The economics columns a project stores (§19.1). */
export function economicsColumns(economics: Economics) {
  return {
    labor_cost: economics.laborCost,
    resource_cost: economics.resourceCost,
    direct_expense_cost: economics.directExpenses,
    full_economic_cost: economics.fullCost,
    partner_recovery: economics.recovery,
    wuwf_contribution: economics.contribution,
    external_margin: economics.externalMargin,
    external_assessment: economics.externalAssessment,
    market_benchmarks: economics.benchmarks,
    economics: { version: 1, lines: economics.lines },
  };
}

/** The estimate's staff hours — the hours WUWF carries when it contributes under a strategic rate. */
export function contributedStaffHours(
  lines: readonly Pick<EconomicsLine, "quantity" | "labor_hours">[],
  classes: readonly { id: string; charged_in_strategic: boolean }[],
): number {
  let hours = 0;
  for (const line of lines) {
    for (const [classId, perUnit] of Object.entries(line.labor_hours)) {
      const cls = classes.find((c) => c.id === classId);
      if (cls && !cls.charged_in_strategic) hours += Number(perUnit) * Number(line.quantity);
    }
  }
  return exactAmount(hours);
}

/** Whether any package on the estimate is charged above its market ceiling (never capped; flagged, §20.5). */
export function aboveMarket(
  benchmarks: readonly { rate: number; ceiling: number | null }[],
): boolean {
  return benchmarks.some((b) => b.ceiling !== null && Number(b.rate) > Number(b.ceiling));
}
