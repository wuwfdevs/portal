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

export function summarizeAffidavitLineItems(
  items: AffidavitLineItemOutcomeInput[],
): AffidavitSummary {
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

/**
 * The period the contract page's "Generate affidavit" link prefills: the
 * contract's start through the earlier of its end and today (station
 * time), since an affidavit attests to what has already aired. A contract
 * that hasn't started yet gets its full run — staff can still adjust it on
 * the form. Every value is an ISO date, so plain string comparison orders
 * them.
 */
export function defaultAffidavitPeriod(
  effectiveFrom: string,
  effectiveTo: string | null,
  today: string,
): { start: string; end: string } {
  if (today < effectiveFrom) return { start: effectiveFrom, end: effectiveTo ?? effectiveFrom };
  const end = effectiveTo !== null && effectiveTo < today ? effectiveTo : today;
  return { start: effectiveFrom, end };
}

/** `/underwriting/affidavits/new`, prefilled with a contract and (optionally) a period. */
export function newAffidavitHref(prefill: {
  contractId?: string;
  start?: string;
  end?: string;
}): string {
  const params = new URLSearchParams();
  if (prefill.contractId) params.set("contract", prefill.contractId);
  if (prefill.start) params.set("start", prefill.start);
  if (prefill.end) params.set("end", prefill.end);
  const query = params.toString();
  return query ? `/underwriting/affidavits/new?${query}` : "/underwriting/affidavits/new";
}
