// Settlement at actual cost — pure, no Supabase, no React.
// docs/bookings-design.md §21 (slice 6, as §20.9 reshaped it). A delivered
// project settles for what it actually cost, not what it was estimated at:
//
//   amount        = the approved estimate's package and labor lines as priced,
//                   plus each direct expense at its ACTUAL cost (and the
//                   assessment on it when the partner is outside the university)
//   actual cost   = confirmed hours per labor class and confirmed units per pool,
//                   each at the rate card's exact unit cost, plus actual expenses
//   contribution  = max(0, actual full cost − amount), the same definition an
//                   estimate uses (economics.ts); margin and assessment are shown
//                   apart and never a negative contribution
//   kind          = a UWF unit is recharged to its funding index; an outside
//                   partner is invoiced
//
// Hours and units come from bk_hours_used (confirmed by production, §20.8), and
// the unit costs from the card the project was priced on (bk_rate_card_unit_costs),
// so a later rate version never rewrites a delivered project's cost. Nothing here
// reprices the estimate. Costs are exact (six decimals); only a billed amount is
// rounded, to cents.

import type { BkPartnerKind, BkPricingTreatment, BkSettlementKind } from "@/lib/database.types";
import { exactAmount } from "./economics";
import type { ConfirmedFigure, ObservedLine } from "./observed";
import { plannedFigures } from "./observed";
import { roundCents } from "./rates";

export type SettlementKind = BkSettlementKind;

/** A UWF unit is recharged to its funding index; an outside partner is invoiced (§2.3). */
export function settlementKindFor(partnerKind: BkPartnerKind): SettlementKind {
  return partnerKind === "external" ? "invoice" : "recharge";
}

export const SETTLEMENT_KIND_LABEL: Record<SettlementKind, string> = {
  recharge: "Recharge to the unit's index",
  invoice: "Invoice",
};

export interface SettlementLine extends ObservedLine {
  id: string;
  /** What the partner pays for the line on the approved estimate. */
  amount: number;
  /** An expense line's estimated cost each, before any assessment. */
  direct_cost: number | null;
}

export interface UnitCosts {
  /** Each labor class's exact loaded hourly cost. */
  labor: readonly { id: string; name: string; hourly: number }[];
  /** Each pool's exact cost per unit. */
  pools: readonly { id: string; name: string; perUnit: number }[];
}

export interface SettlementInputs {
  partnerKind: BkPartnerKind;
  /** What the estimate was priced as; settlement keeps it, it never re-derives it. */
  treatment: BkPricingTreatment | null;
  lines: readonly SettlementLine[];
  /** Production's confirmed hours and units. */
  confirmed: readonly ConfirmedFigure[];
  unitCosts: UnitCosts;
  assessmentShare: number;
  /** Actual total cost per expense line id; a line with no entry settles as estimated. */
  expenseActuals?: Readonly<Record<string, number>>;
  /** What the estimate stored, kept for the variance; null when it could not be modeled. */
  estimatedFullCost?: number | null;
  estimatedContribution?: number | null;
}

export interface SettlementExpense {
  lineId: string;
  label: string;
  estimatedCost: number;
  actualCost: number;
  /** What the partner is charged for it: the cost, plus the assessment when external. */
  billed: number;
}

export interface SettlementFigures {
  kind: SettlementKind;
  /** What the partner is charged. */
  amount: number;
  /** The estimate's recovery, for the variance. */
  estimatedRecovery: number;
  laborCost: number;
  resourceCost: number;
  directCost: number;
  fullCost: number;
  contribution: number;
  assessment: number;
  margin: number;
  expenses: SettlementExpense[];
  /** Cost against what the estimate modeled: positive means it cost more. Null when the estimate had no cost. */
  costVariance: number | null;
}

export type SettlementResult =
  { ok: true; figures: SettlementFigures } | { ok: false; error: string };

/** Whether production has confirmed everything the estimate planned. Settlement waits on it. */
export function hoursConfirmed(
  lines: readonly ObservedLine[],
  confirmed: readonly ConfirmedFigure[],
): boolean {
  const planned = plannedFigures(lines);
  const classIds = Object.keys(planned.labor);
  const poolIds = Object.keys(planned.resources);
  if (classIds.length === 0 && poolIds.length === 0) return true;
  return (
    classIds.every((id) => confirmed.some((f) => f.kind === "labor" && f.id === id)) &&
    poolIds.every((id) => confirmed.some((f) => f.kind === "units" && f.id === id))
  );
}

/**
 * The settlement a delivered project's figures give. An error is a sentence for
 * Finance: hours not confirmed, or a class or pool the card recorded no cost for.
 */
export function draftSettlement(input: SettlementInputs): SettlementResult {
  if (!hoursConfirmed(input.lines, input.confirmed)) {
    return {
      ok: false,
      error:
        "Production has not confirmed the hours and equipment used yet. Settle once they have.",
    };
  }
  const external = input.partnerKind === "external";

  let labor = 0;
  for (const figure of input.confirmed.filter((f) => f.kind === "labor")) {
    const rate = input.unitCosts.labor.find((l) => l.id === figure.id);
    if (!rate) {
      return {
        ok: false,
        error: "A labor class used on this project has no cost on the rate card it was priced on.",
      };
    }
    labor += Number(figure.used) * rate.hourly;
  }
  let resource = 0;
  for (const figure of input.confirmed.filter((f) => f.kind === "units")) {
    const rate = input.unitCosts.pools.find((p) => p.id === figure.id);
    if (!rate) {
      return {
        ok: false,
        error:
          "Equipment or space used on this project has no cost on the rate card it was priced on.",
      };
    }
    resource += Number(figure.used) * rate.perUnit;
  }

  const expenses: SettlementExpense[] = [];
  let direct = 0;
  let billedExpenses = 0;
  let otherAmount = 0;
  for (const line of input.lines) {
    if (line.kind !== "expense") {
      otherAmount += Number(line.amount);
      continue;
    }
    const estimatedCost = exactAmount(Number(line.direct_cost ?? 0) * Number(line.quantity));
    const typed = input.expenseActuals?.[line.id];
    const actualCost = typed === undefined ? estimatedCost : Number(typed);
    if (!Number.isFinite(actualCost) || actualCost < 0) {
      return { ok: false, error: `${line.label}'s actual cost must be a number, zero or more.` };
    }
    // An expense is passed through at cost, plus the assessment on its cost when external (§7).
    const billed = roundCents(external ? actualCost * (1 + input.assessmentShare) : actualCost);
    direct += actualCost;
    billedExpenses += billed;
    expenses.push({
      lineId: line.id,
      label: line.label,
      estimatedCost,
      actualCost: exactAmount(actualCost),
      billed,
    });
  }

  const amount = roundCents(otherAmount + billedExpenses);
  const fullCost = labor + resource + direct;
  const assessment = external ? (otherAmount + direct) * input.assessmentShare : 0;
  const estimatedRecovery = roundCents(
    input.lines.reduce((total, l) => total + Number(l.amount), 0),
  );
  const estimatedFull = input.estimatedFullCost ?? null;
  return {
    ok: true,
    figures: {
      kind: settlementKindFor(input.partnerKind),
      amount,
      estimatedRecovery,
      laborCost: exactAmount(labor),
      resourceCost: exactAmount(resource),
      directCost: exactAmount(direct),
      fullCost: exactAmount(fullCost),
      contribution: exactAmount(Math.max(0, fullCost - amount)),
      assessment: exactAmount(assessment),
      margin: exactAmount(external ? Math.max(0, amount - assessment - fullCost) : 0),
      expenses,
      costVariance: estimatedFull === null ? null : exactAmount(fullCost - estimatedFull),
    },
  };
}

/** The columns a drafted settlement stores (bk_settlements). */
export function settlementColumns(
  figures: SettlementFigures,
  extra: {
    expenseActuals: Record<string, number>;
    estimatedFullCost: number | null;
    estimatedContribution: number | null;
    rateModelVersionId: string | null;
    fundingIndex: string | null;
    notes: string | null;
  },
) {
  return {
    kind: figures.kind,
    amount: figures.amount,
    estimated_recovery: figures.estimatedRecovery,
    estimated_full_cost: extra.estimatedFullCost,
    estimated_contribution: extra.estimatedContribution,
    actual_labor_cost: figures.laborCost,
    actual_resource_cost: figures.resourceCost,
    actual_direct_cost: figures.directCost,
    actual_full_cost: figures.fullCost,
    wuwf_contribution: figures.contribution,
    assessment_amount: figures.assessment,
    external_margin: figures.margin,
    expense_actuals: extra.expenseActuals,
    rate_model_version_id: extra.rateModelVersionId,
    funding_index: extra.fundingIndex,
    notes: extra.notes,
  };
}

/**
 * Null when the posting details are in order; otherwise a sentence for the screen.
 * A recharge needs the index it is charged to, and either kind the journal entry
 * number Finance keyed in the university's own system.
 */
export function validatePosting(
  kind: SettlementKind,
  journalEntryNumber: string,
  fundingIndex: string,
): string | null {
  if (journalEntryNumber.trim() === "") return "Enter the journal entry number to post.";
  if (kind === "recharge" && fundingIndex.trim() === "") {
    return "A recharge names the funding index it is charged to.";
  }
  return null;
}

/** The project page's and the dashboard's view of where a delivered project stands on settling. */
export type SettlementState = "awaiting_hours" | "ready_to_draft" | "drafted" | "posted";

export function settlementState(
  lines: readonly ObservedLine[],
  confirmed: readonly ConfirmedFigure[],
  settlement: { status: "drafted" | "posted" } | null,
): SettlementState {
  if (settlement) return settlement.status;
  return hoursConfirmed(lines, confirmed) ? "ready_to_draft" : "awaiting_hours";
}

export const SETTLEMENT_STATE_LABEL: Record<SettlementState, string> = {
  awaiting_hours: "Waiting on the hours used",
  ready_to_draft: "Ready to settle",
  drafted: "Settlement drafted",
  posted: "Settled",
};

// The term report -------------------------------------------------------------------------------------------

export interface SettledProject {
  id: string;
  title: string;
  partner_name: string;
  kind: SettlementKind;
  amount: number;
  estimated_recovery: number;
  estimated_full_cost: number | null;
  estimated_contribution: number | null;
  actual_full_cost: number;
  wuwf_contribution: number;
  assessment_amount: number;
  external_margin: number;
}

export interface SettledSummary {
  count: number;
  /** What was charged against what the estimates said would be. */
  amount: number;
  estimatedRecovery: number;
  actualFullCost: number;
  /** Projects whose estimate carried a modeled cost, so the two cost totals compare like with like. */
  comparableCount: number;
  /** Those projects' actual cost and their estimates' modeled cost. */
  comparableActualCost: number;
  estimatedFullCost: number;
  contribution: number;
  estimatedContribution: number;
  assessment: number;
  margin: number;
}

/** Posted settlements totalled for the term report: actual against estimated, never mixed with unsettled work. */
export function settledSummary(rows: readonly SettledProject[]): SettledSummary {
  const out: SettledSummary = {
    count: rows.length,
    amount: 0,
    estimatedRecovery: 0,
    actualFullCost: 0,
    comparableCount: 0,
    comparableActualCost: 0,
    estimatedFullCost: 0,
    contribution: 0,
    estimatedContribution: 0,
    assessment: 0,
    margin: 0,
  };
  for (const row of rows) {
    out.amount = exactAmount(out.amount + Number(row.amount));
    out.estimatedRecovery = exactAmount(out.estimatedRecovery + Number(row.estimated_recovery));
    out.actualFullCost = exactAmount(out.actualFullCost + Number(row.actual_full_cost));
    out.contribution = exactAmount(out.contribution + Number(row.wuwf_contribution));
    out.assessment = exactAmount(out.assessment + Number(row.assessment_amount));
    out.margin = exactAmount(out.margin + Number(row.external_margin));
    if (row.estimated_full_cost !== null) {
      out.comparableCount += 1;
      out.comparableActualCost = exactAmount(
        out.comparableActualCost + Number(row.actual_full_cost),
      );
      out.estimatedFullCost = exactAmount(out.estimatedFullCost + Number(row.estimated_full_cost));
      out.estimatedContribution = exactAmount(
        out.estimatedContribution + Number(row.estimated_contribution ?? 0),
      );
    }
  }
  return out;
}
