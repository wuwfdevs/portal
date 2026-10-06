// Derived pricing and the estimate's arithmetic — pure, no Supabase, no React.
// docs/bookings-design.md §2.2: a project is priced as one of three
// treatments from facts already on it, and the estimate shows the reason.
// Rates come from the version's rate card snapshot (bk_rate_card_lines),
// never recomputed here, so an estimate keeps the rate it was priced at. SQL
// never computes a price; this module does, and the actions store the result.

import type { BkEstimateLineKind, BkPricingTreatment } from "@/lib/database.types";
import { roundCents } from "./rates";
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
