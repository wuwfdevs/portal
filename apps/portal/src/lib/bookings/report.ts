// The term report's totals — pure, no Supabase, no React.
// docs/bookings-design.md §19.3. Full cost, WUWF contribution and partner
// recovery by partner and by pricing treatment, so the pilot can show what WUWF
// contributes to university work and test the legacy $500 webcast price
// against modeled cost. Qualifying strategic work is counted by the judgment
// (`qualifies_strategic`), not by the rate it ended up priced at.

import type { BkPricingTreatment, BkProjectStage } from "@/lib/database.types";
import { exactAmount, type LineEconomics } from "./economics";

/** The customary internal webcast charge the framework replaces (§1). */
export const LEGACY_WEBCAST_PRICE = 500;

export interface ReportProject {
  id: string;
  partner_id: string;
  partner_name: string;
  priced_as: BkPricingTreatment | null;
  stage: BkProjectStage;
  /** A closed (deferred, declined, withdrawn) project is counted apart, not in the totals. */
  closed: boolean;
  qualifies_strategic: boolean | null;
  reserve_depleted: boolean;
  full_economic_cost: number | null;
  partner_recovery: number | null;
  wuwf_contribution: number | null;
  external_margin: number | null;
  external_assessment: number | null;
  lines: readonly LineEconomics[];
}

export interface Totals {
  count: number;
  fullCost: number;
  recovery: number;
  contribution: number;
  margin: number;
  assessment: number;
}

export const EMPTY_TOTALS: Totals = {
  count: 0,
  fullCost: 0,
  recovery: 0,
  contribution: 0,
  margin: 0,
  assessment: 0,
};

function add(totals: Totals, project: ReportProject): Totals {
  return {
    count: totals.count + 1,
    fullCost: exactAmount(totals.fullCost + Number(project.full_economic_cost ?? 0)),
    recovery: exactAmount(totals.recovery + Number(project.partner_recovery ?? 0)),
    contribution: exactAmount(totals.contribution + Number(project.wuwf_contribution ?? 0)),
    margin: exactAmount(totals.margin + Number(project.external_margin ?? 0)),
    assessment: exactAmount(totals.assessment + Number(project.external_assessment ?? 0)),
  };
}

export type ReportScope = "priced" | "booked";

const BOOKED: readonly BkProjectStage[] = ["booked", "delivered", "settled"];

export interface WebcastComparison {
  events: number;
  /** Modeled full cost per event, exact. */
  costPerEvent: number;
  /** What partners are charged per event. */
  priceChargedPerEvent: number;
  /** The convention it replaces. */
  legacyPrice: number;
  /** Price charged minus the legacy $500, per event. */
  priceVersusLegacy: number;
  /** Modeled cost minus the legacy $500, per event: how far the convention is from cost. */
  costVersusLegacy: number;
}

export interface TermReport {
  scope: ReportScope;
  totals: Totals;
  byPartner: (Totals & { partnerId: string; name: string })[];
  byTreatment: Record<BkPricingTreatment, Totals>;
  /** Projects the judgment says qualify, however they were priced. */
  qualifying: { count: number; pricedUniversityRateForWantOfReserve: number };
  closedCount: number;
  webcast: WebcastComparison | null;
}

/** The term's totals over priced projects: everything priced, or only what is booked. */
export function termReport(projects: readonly ReportProject[], scope: ReportScope): TermReport {
  const priced = projects.filter((p) => p.full_economic_cost !== null);
  const open = priced.filter((p) => !p.closed);
  const counted = scope === "booked" ? open.filter((p) => BOOKED.includes(p.stage)) : open;

  let totals = EMPTY_TOTALS;
  const partners = new Map<string, Totals & { partnerId: string; name: string }>();
  const byTreatment: Record<BkPricingTreatment, Totals> = {
    strategic: EMPTY_TOTALS,
    incremental: EMPTY_TOTALS,
    external: EMPTY_TOTALS,
  };
  for (const project of counted) {
    totals = add(totals, project);
    const partner = partners.get(project.partner_id) ?? {
      ...EMPTY_TOTALS,
      partnerId: project.partner_id,
      name: project.partner_name,
    };
    partners.set(project.partner_id, { ...add(partner, project), partnerId: partner.partnerId, name: partner.name });
    if (project.priced_as) byTreatment[project.priced_as] = add(byTreatment[project.priced_as], project);
  }

  let events = 0;
  let cost = 0;
  let charged = 0;
  for (const project of counted) {
    for (const line of project.lines) {
      if (line.kind !== "package" || line.unitLabel.toLowerCase() !== "event") continue;
      events += line.quantity;
      cost += line.laborCost + line.resourceCost;
      charged += line.amount;
    }
  }

  return {
    scope,
    totals,
    byPartner: [...partners.values()].sort(
      (a, b) => b.contribution - a.contribution || a.name.localeCompare(b.name),
    ),
    byTreatment,
    qualifying: {
      count: counted.filter((p) => p.qualifies_strategic === true).length,
      pricedUniversityRateForWantOfReserve: counted.filter(
        (p) => p.qualifies_strategic === true && p.reserve_depleted,
      ).length,
    },
    closedCount: priced.filter((p) => p.closed).length,
    webcast:
      events > 0
        ? {
            events,
            costPerEvent: exactAmount(cost / events),
            priceChargedPerEvent: exactAmount(charged / events),
            legacyPrice: LEGACY_WEBCAST_PRICE,
            priceVersusLegacy: exactAmount(charged / events - LEGACY_WEBCAST_PRICE),
            costVersusLegacy: exactAmount(cost / events - LEGACY_WEBCAST_PRICE),
          }
        : null,
  };
}

/** Whether a project belongs to the term: its event date in the term, else the day it was entered. */
export function inTerm(
  project: { event_starts_on: string | null; created_at: string },
  term: { starts_on: string; ends_on: string },
): boolean {
  const date = project.event_starts_on ?? project.created_at.slice(0, 10);
  return date >= term.starts_on && date <= term.ends_on;
}
