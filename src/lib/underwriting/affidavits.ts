// Pure logic for Workflow G (docs/underwriting-design.md) — summarizing an
// affidavit's line items for display. No Supabase import, colocated test.

export interface AffidavitLineItemOutcomeInput {
  outcome: string;
}

export interface AffidavitSummary {
  totalLineItems: number;
  airedAsScheduled: number;
  otherOutcomes: number;
}

export function summarizeAffidavitLineItems(items: AffidavitLineItemOutcomeInput[]): AffidavitSummary {
  const airedAsScheduled = items.filter((item) => item.outcome === "aired_as_scheduled").length;
  return {
    totalLineItems: items.length,
    airedAsScheduled,
    otherOutcomes: items.length - airedAsScheduled,
  };
}

/**
 * A human-readable report identifier for a newly generated affidavit —
 * §17's "unique identifier." `priorCount` is how many affidavits already
 * exist for this exact contract/period (regeneration is allowed, per
 * docs/underwriting-design.md §17's "should remain available for... and
 * regeneration"); a second generation for the same period gets a version
 * suffix rather than an indistinguishable duplicate label.
 */
export function buildReportIdentifier(
  contractIdentifier: string,
  periodStart: string,
  periodEnd: string,
  priorCount: number,
): string {
  const base = `${contractIdentifier}-${periodStart}-${periodEnd}`;
  return priorCount > 0 ? `${base}-v${priorCount + 1}` : base;
}
