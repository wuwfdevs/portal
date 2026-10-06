// Derived pricing and the estimate's arithmetic — pure, no Supabase, no React.
// docs/bookings-design.md §2.2: a project is priced as one of three
// treatments from facts already on it, and the estimate shows the reason.
// Rates come from the version's rate card snapshot (bk_rate_card_lines),
// never recomputed here, so an estimate keeps the rate it was priced at. SQL
// never computes a price; this module does, and the actions store the result.

import type { BkEstimateLineKind, BkPricingTreatment } from "@/lib/database.types";
import { priceRecipe, roundCents, type PackageCosts } from "./rates";
import type { ClassCapacitySummary, HoursByClass } from "./scheduling";

/** The customary internal webcast charge the framework replaces (§1). */
export const LEGACY_WEBCAST_RATE = 500;

// Derivation ------------------------------------------------------------------------------------------

export interface PricingFacts {
  partnerKind: "uwf_unit" | "external";
  /** The project is under an active agreement (slice 5): priced against its allocated reserve share, incremental beyond it. */
  underAgreement: boolean;
  /** The lead's recorded judgment; null until recorded. */
  qualifiesStrategic: boolean | null;
  /** Whether every tracked professional class's reserve covers the estimate's draw (null: no draw to check). */
  reserveCovers: boolean | null;
}

export interface DerivedPricing {
  treatment: BkPricingTreatment;
  reason: string;
  /**
   * The request qualifies (or is under an agreement) but the reserve could not cover it,
   * so it was priced at the university rate (§18.5). A finding of the system; the
   * judgment itself (`qualifies_strategic`) is never changed by it.
   */
  reserveDepleted: boolean;
}

/** §2.2's table, top to bottom. */
export function derivePricing(facts: PricingFacts): DerivedPricing {
  if (facts.partnerKind === "external") {
    return {
      treatment: "external",
      reason:
        "The partner is outside the university: full cost, the New Ventures assessment and the contribution margin, floored at market.",
      reserveDepleted: false,
    };
  }
  if (facts.underAgreement) {
    return facts.reserveCovers === false
      ? {
          treatment: "incremental",
          reason:
            "Under an agreement whose allocated reserve share is used up: priced incremental beyond it.",
          reserveDepleted: true,
        }
      : {
          treatment: "strategic",
          reason: "Under an agreement: priced against its allocated reserve share.",
          reserveDepleted: false,
        };
  }
  if (facts.qualifiesStrategic === true) {
    if (facts.reserveCovers === false) {
      return {
        treatment: "incremental",
        reason:
          "Qualifies as strategic work, but the reserve's unused balance does not cover its professional hours: priced incremental.",
        reserveDepleted: true,
      };
    }
    return {
      treatment: "strategic",
      reason:
        "Qualifies as strategic or applied-learning work and the reserve covers its professional hours: student labor, resources and direct costs; professional labor is WUWF's contribution.",
      reserveDepleted: false,
    };
  }
  return {
    treatment: "incremental",
    reason:
      facts.qualifiesStrategic === null
        ? "Not yet judged strategic: priced incremental — strategic components plus professional labor at the loaded rate."
        : "Does not qualify as strategic work: strategic components plus professional labor at the loaded rate.",
    reserveDepleted: false,
  };
}

export interface LaborClassFlag {
  id: string;
  charged_in_strategic: boolean;
}

/**
 * Whether the reserve's unused balance covers the estimate's professional
 * draw — for every class not charged in a strategic price that the term
 * tracks. A class with no capacity row that term is not checked (§6.4).
 * Null when the estimate draws no professional hours at all.
 */
export function reserveCoversDraw(
  draw: HoursByClass,
  classes: readonly LaborClassFlag[],
  summaries: readonly ClassCapacitySummary[],
): boolean | null {
  let checked = false;
  for (const cls of classes) {
    if (cls.charged_in_strategic) continue;
    const hours = Number(draw[cls.id] ?? 0);
    if (hours <= 0) continue;
    const summary = summaries.find((row) => row.labor_class_id === cls.id);
    if (!summary) continue;
    checked = true;
    if (hours > summary.reserveRemaining) return false;
  }
  return checked ? true : null;
}

// Lines -------------------------------------------------------------------------------------------------

export interface EstimateLineLike {
  kind: BkEstimateLineKind;
  package_id: string | null;
  labor_class_id: string | null;
  unit_label: string;
  quantity: number;
  unit_rate: number;
  amount: number;
  /** An expense line's cost each as typed, before any assessment (§18.8); null otherwise. */
  direct_cost?: number | null;
  /** Per unit of the line. */
  labor_hours: HoursByClass;
}

export interface CardLineLike {
  kind: "package" | "labor";
  package_id: string | null;
  labor_class_id: string | null;
  strategic_rate: number | null;
  incremental_rate: number | null;
  external_rate: number;
}

/** The estimate's hours per labor class: Σ quantity × the line's hours per unit. */
export function estimateDraw(lines: readonly EstimateLineLike[]): HoursByClass {
  const draw: HoursByClass = {};
  for (const line of lines) {
    for (const [classId, perUnit] of Object.entries(line.labor_hours)) {
      const hours = Number(perUnit) * Number(line.quantity);
      if (hours <= 0) continue;
      draw[classId] = roundCents((draw[classId] ?? 0) + hours);
    }
  }
  return draw;
}

export interface LinePrice {
  unit_rate: number;
  amount: number;
}

export type PriceLineResult = { ok: true; price: LinePrice } | { ok: false; error: string };

/**
 * One line's rate under a treatment, from the card snapshot: a package line
 * takes the card's rate for the treatment; a labor line takes the class's
 * loaded internal cost (external: its planning rate), and is WUWF's
 * contribution — zero — when the class is baseline-funded and the project
 * is strategic; a direct expense is at cost, plus the assessment when the
 * project is external (§7, "Pass-through").
 */
export function priceLine(
  line: Pick<
    EstimateLineLike,
    "kind" | "package_id" | "labor_class_id" | "quantity" | "unit_rate" | "direct_cost"
  >,
  treatment: BkPricingTreatment,
  card: readonly CardLineLike[],
  classes: readonly LaborClassFlag[],
  assessmentShare: number,
): PriceLineResult {
  let rate: number;
  if (line.kind === "package") {
    const cardLine = card.find((c) => c.kind === "package" && c.package_id === line.package_id);
    if (!cardLine) return { ok: false, error: "This package is not on the rate card in use." };
    const picked =
      treatment === "strategic"
        ? cardLine.strategic_rate
        : treatment === "incremental"
          ? cardLine.incremental_rate
          : cardLine.external_rate;
    if (picked === null) {
      return {
        ok: false,
        error: "The rate card has no rate for this package under this treatment.",
      };
    }
    rate = Number(picked);
  } else if (line.kind === "labor") {
    const cardLine = card.find(
      (c) => c.kind === "labor" && c.labor_class_id === line.labor_class_id,
    );
    if (!cardLine) return { ok: false, error: "This labor class is not on the rate card in use." };
    const cls = classes.find((c) => c.id === line.labor_class_id);
    if (treatment === "strategic" && cls && !cls.charged_in_strategic) {
      rate = 0;
    } else if (treatment === "external") {
      rate = Number(cardLine.external_rate);
    } else {
      rate = Number(cardLine.incremental_rate ?? 0);
    }
  } else {
    // The typed cost, never the stored rate: a rate derived from it must not feed back in.
    const cost = Number(line.direct_cost ?? line.unit_rate);
    rate = treatment === "external" ? roundCents(cost * (1 + assessmentShare)) : roundCents(cost);
  }
  return { ok: true, price: { unit_rate: rate, amount: roundCents(rate * Number(line.quantity)) } };
}

export interface EstimateTotals {
  total: number;
  packages: number;
  labor: number;
  expenses: number;
}

export function estimateTotals(lines: readonly EstimateLineLike[]): EstimateTotals {
  const sum = (kind: BkEstimateLineKind) =>
    roundCents(
      lines.filter((l) => l.kind === kind).reduce((total, l) => total + Number(l.amount), 0),
    );
  const packages = sum("package");
  const labor = sum("labor");
  const expenses = sum("expense");
  return { total: roundCents(packages + labor + expenses), packages, labor, expenses };
}

/**
 * The modeled price minus the $500 convention per webcast event (§1, §5):
 * recorded at estimate approval. A webcast line is a package line priced per
 * event. Null when the estimate has none, since there is nothing to compare.
 */
export function legacyRateDelta(lines: readonly EstimateLineLike[]): number | null {
  const webcastEvents = lines
    .filter((l) => l.kind === "package" && l.unit_label.toLowerCase() === "event")
    .reduce((total, l) => total + Number(l.quantity), 0);
  if (webcastEvents <= 0) return null;
  return roundCents(estimateTotals(lines).total - webcastEvents * LEGACY_WEBCAST_RATE);
}

/** An external estimate's contribution margin: the share of its price the margin input names. */
export function estimateMargin(total: number, externalMarginShare: number): number {
  return roundCents(total * externalMarginShare);
}

// Packages are default recipes (docs/bookings-design.md §20.6) ------------------------------------------

export interface RecipeLine {
  kind: BkEstimateLineKind;
  /** What this project uses. */
  labor_hours: HoursByClass;
  resource_units: Record<string, number>;
  /** The standard recipe the line started from; null on a line that has none (labor, expense). */
  recipe_labor_hours?: HoursByClass | null;
  recipe_resource_units?: Record<string, number> | null;
  adjustment_reason?: string | null;
}

function sameRecord(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (Math.abs(Number(a[key] ?? 0) - Number(b[key] ?? 0)) > 1e-9) return false;
  }
  return true;
}

/** A package line whose hours or units differ from the recipe it started from. */
export function isAdjusted(line: RecipeLine): boolean {
  if (line.kind !== "package" || !line.recipe_labor_hours || !line.recipe_resource_units) {
    return false;
  }
  return (
    !sameRecord(line.labor_hours, line.recipe_labor_hours) ||
    !sameRecord(line.resource_units, line.recipe_resource_units)
  );
}

export interface RecipeDifference {
  /** Each class or pool whose figure differs from the standard recipe. */
  labor: { classId: string; standard: number; actual: number }[];
  resources: { poolId: string; standard: number; actual: number }[];
}

/** How an adjusted line differs from its standard recipe, so the page can show the difference. */
export function recipeDifference(line: RecipeLine): RecipeDifference {
  const diff = (standard: Record<string, number>, actual: Record<string, number>) =>
    [...new Set([...Object.keys(standard), ...Object.keys(actual)])]
      .map((key) => ({
        key,
        standard: Number(standard[key] ?? 0),
        actual: Number(actual[key] ?? 0),
      }))
      .filter((row) => Math.abs(row.standard - row.actual) > 1e-9);
  return {
    labor: diff(line.recipe_labor_hours ?? {}, line.labor_hours).map(({ key, ...rest }) => ({
      classId: key,
      ...rest,
    })),
    resources: diff(line.recipe_resource_units ?? {}, line.resource_units).map(({ key, ...rest }) => ({
      poolId: key,
      ...rest,
    })),
  };
}

export interface UnitCostRowLike {
  kind: "labor" | "pool";
  labor_class_id: string | null;
  pool_id: string | null;
  name: string;
  unit_cost: number;
  charged_in_strategic: boolean | null;
}

/** The snapshot's unit costs as the recipe math reads them. */
export function unitCostsFromRows(rows: readonly UnitCostRowLike[]) {
  return {
    labor: rows
      .filter((r) => r.kind === "labor" && r.labor_class_id)
      .map((r) => ({
        id: r.labor_class_id!,
        name: r.name,
        hourly: Number(r.unit_cost),
        charged: r.charged_in_strategic === true,
      })),
    pools: rows
      .filter((r) => r.kind === "pool" && r.pool_id)
      .map((r) => ({ id: r.pool_id!, name: r.name, perUnit: Number(r.unit_cost) })),
  };
}

export interface AdjustedLinePrice {
  rates: Pick<PackageCosts, "strategicRate" | "incrementalRate" | "externalRate" | "laborCost" | "resourceCost">;
  /** The adjusted scope's full cost over the standard recipe's: what the market floor and ceiling are scaled by. */
  scale: number;
  floor: number;
  ceiling: number | null;
}

/**
 * The rates of a package line adjusted on a project: the same recipe math the
 * card uses, over the version's unit costs. The market floor and ceiling are
 * scaled by the ratio of the adjusted full cost to the standard full cost, so a
 * lighter scope isn't held to a heavier scope's floor (§20.6 — a judgment this
 * pass records for Finance to confirm).
 */
export function adjustedLinePrice(
  line: Pick<RecipeLine, "labor_hours" | "resource_units" | "recipe_labor_hours" | "recipe_resource_units">,
  card: { market_floor: number | null; market_ceiling?: number | null },
  unitCosts: readonly UnitCostRowLike[],
  inputs: { externalMarginShare: number; assessmentShare: number },
  name = "Package",
): AdjustedLinePrice {
  const costs = unitCostsFromRows(unitCosts);
  const standard = priceRecipe(
    {
      name,
      labor: line.recipe_labor_hours ?? {},
      resources: line.recipe_resource_units ?? {},
    },
    costs,
    inputs,
    0,
  );
  const standardFull = standard.laborCost + standard.resourceCost;
  const adjustedProbe = priceRecipe(
    { name, labor: line.labor_hours, resources: line.resource_units },
    costs,
    inputs,
    0,
  );
  const scale =
    standardFull > 0 ? (adjustedProbe.laborCost + adjustedProbe.resourceCost) / standardFull : 1;
  const floor = roundCents(Number(card.market_floor ?? 0) * scale);
  const ceiling =
    card.market_ceiling === null || card.market_ceiling === undefined
      ? null
      : roundCents(Number(card.market_ceiling) * scale);
  const priced = priceRecipe(
    { name, labor: line.labor_hours, resources: line.resource_units },
    costs,
    inputs,
    floor,
  );
  return {
    rates: {
      strategicRate: priced.strategicRate,
      incrementalRate: priced.incrementalRate,
      externalRate: priced.externalRate,
      laborCost: priced.laborCost,
      resourceCost: priced.resourceCost,
    },
    scale,
    floor,
    ceiling,
  };
}

/** A package line's price when its recipe has been adjusted: the rate for the treatment from the adjusted recipe. */
export function priceAdjustedLine(
  line: Pick<EstimateLineLike, "quantity"> & RecipeLine,
  treatment: BkPricingTreatment,
  card: { market_floor: number | null; market_ceiling?: number | null },
  unitCosts: readonly UnitCostRowLike[],
  inputs: { externalMarginShare: number; assessmentShare: number },
  name?: string,
): { unit_rate: number; amount: number; detail: AdjustedLinePrice } {
  const detail = adjustedLinePrice(line, card, unitCosts, inputs, name);
  const rate =
    treatment === "strategic"
      ? detail.rates.strategicRate
      : treatment === "incremental"
        ? detail.rates.incrementalRate
        : detail.rates.externalRate;
  return {
    unit_rate: rate,
    amount: roundCents(rate * Number(line.quantity)),
    detail,
  };
}
