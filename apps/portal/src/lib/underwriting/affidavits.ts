// Pure logic for Workflow G (docs/underwriting-design.md) — summarizing an
// affidavit's line items for display. No Supabase import, colocated test.

import { STATION_TIME_ZONE, shiftDateISO } from "@/lib/log/timezone";

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

// The client-facing document ------------------------------------------------
// What the certified PDF (affidavit-pdf.tsx) and the affidavit page's
// preview both render, built from the evidence one way so the two can't
// disagree. WUWF's earlier spreadsheet template listed times only; this adds
// ordered-against-aired per schedule line and names each makegood, so a
// sponsor can check delivery without counting rows.

/** The station block every affidavit prints, as WUWF's template has it. */
export const STATION_LETTERHEAD = {
  name: "WUWF-FM",
  addressLines: ["11000 University Pkwy, Bldg 88", "Pensacola, FL 32514"],
} as const;

/**
 * Outcomes that count as the credit having aired. aired_different_time is
 * included — it did air, and the affidavit prints the actual time;
 * wrong_copy_aired and partially_aired are not what the sponsor ordered.
 */
const AIRED_OUTCOMES = new Set(["aired_as_scheduled", "aired_different_time", "makegood_aired"]);

export function isAiredOutcome(outcome: string): boolean {
  return AIRED_OUTCOMES.has(outcome);
}

export interface AffidavitAiringInput {
  broadcastEventId: string;
  outcome: string;
  /** actual_started_at when the host recorded one, else the placement's scheduled time. */
  airedAt: string;
  programName: string;
  copyLabel: string | null;
  durationSeconds: number | null;
  scheduleLineId: string;
  demandBucketId: string;
  /** For a makegood airing: when the credit it replaces was scheduled. */
  makegoodForScheduledAt: string | null;
}

export interface AffidavitScheduleLineInput {
  id: string;
  label: string;
  serviceLevel: "guaranteed" | "bonus";
}

export interface AffidavitBucketInput {
  id: string;
  scheduleLineId: string;
  periodStart: string;
  periodEnd: string;
  quantityRequired: number;
  status: "active" | "superseded" | "cancelled";
}

export interface AffidavitDocumentInput {
  periodStart: string;
  periodEnd: string;
  underwriterName: string;
  mailingAddress: string | null;
  scheduleLines: AffidavitScheduleLineInput[];
  buckets: AffidavitBucketInput[];
  airings: AffidavitAiringInput[];
}

export interface AffidavitSummaryRow {
  scheduleLineId: string;
  label: string;
  bonus: boolean;
  ordered: number;
  aired: number;
}

export interface AffidavitDocumentRow {
  broadcastEventId: string;
  date: string;
  time: string;
  program: string;
  message: string | null;
  /** "Makegood for Thu, Mar 12", or null. */
  note: string | null;
  /** Shown only when the announcements don't all share one length. */
  length: string | null;
}

export interface AffidavitDocument {
  recipientLines: string[];
  periodLabel: string;
  /** "30-second announcements" when every airing shares one length, else null. */
  lengthLabel: string | null;
  summary: AffidavitSummaryRow[];
  /** Airings listed below whose schedule period isn't wholly inside this affidavit's dates. */
  outsideSummaryCount: number;
  rows: AffidavitDocumentRow[];
  airedCount: number;
  certificationSentence: string;
}

function stationDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: STATION_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function stationDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: STATION_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function stationTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: STATION_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** A calendar date (YYYY-MM-DD) as "March 1, 2026", never shifted by a timezone. */
export function formatCalendarDate(dateISO: string): string {
  return new Date(`${dateISO}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function lengthLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function certificationSentence(count: number): string {
  const what =
    count === 1
      ? "the 1 announcement listed above was"
      : `the ${count} announcements listed above were`;
  return `I certify that, in accordance with the official station logs, ${what} broadcast as shown on this affidavit.`;
}

export function buildAffidavitDocument(input: AffidavitDocumentInput): AffidavitDocument {
  const aired = input.airings
    .filter((airing) => isAiredOutcome(airing.outcome))
    .sort((a, b) => new Date(a.airedAt).getTime() - new Date(b.airedAt).getTime());

  // Ordered-against-aired counts only schedule periods wholly inside the
  // affidavit's dates: a week or month still running at the end would read
  // as a shortfall that is really just time not yet elapsed.
  const summarizedBuckets = input.buckets.filter(
    (bucket) =>
      bucket.status === "active" &&
      bucket.periodStart >= input.periodStart &&
      bucket.periodEnd <= input.periodEnd,
  );
  const summarizedBucketIds = new Set(summarizedBuckets.map((bucket) => bucket.id));

  const summary: AffidavitSummaryRow[] = [];
  for (const line of input.scheduleLines) {
    const buckets = summarizedBuckets.filter((bucket) => bucket.scheduleLineId === line.id);
    const lineAired = aired.filter(
      (airing) =>
        airing.scheduleLineId === line.id && summarizedBucketIds.has(airing.demandBucketId),
    ).length;
    const ordered = buckets.reduce((sum, bucket) => sum + bucket.quantityRequired, 0);
    if (ordered === 0 && lineAired === 0) continue;
    summary.push({
      scheduleLineId: line.id,
      label: line.label,
      bonus: line.serviceLevel === "bonus",
      ordered,
      aired: lineAired,
    });
  }
  const outsideSummaryCount = aired.filter(
    (airing) => !summarizedBucketIds.has(airing.demandBucketId),
  ).length;

  const lengths = new Set(aired.map((airing) => airing.durationSeconds));
  const sharedLength = lengths.size === 1 ? [...lengths][0] : null;

  const rows = aired.map((airing) => ({
    broadcastEventId: airing.broadcastEventId,
    date: stationDate(airing.airedAt),
    time: stationTime(airing.airedAt),
    program: airing.programName,
    message: airing.copyLabel,
    note: airing.makegoodForScheduledAt
      ? `Makegood for ${stationDateShort(airing.makegoodForScheduledAt)}`
      : null,
    length:
      sharedLength === null && airing.durationSeconds !== null
        ? lengthLabel(airing.durationSeconds)
        : null,
  }));

  const recipientLines = [
    input.underwriterName,
    ...(input.mailingAddress ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== ""),
  ];

  return {
    recipientLines,
    periodLabel: `${formatCalendarDate(input.periodStart)} – ${formatCalendarDate(input.periodEnd)}`,
    lengthLabel: sharedLength ? `${sharedLength}-second announcements` : null,
    summary,
    outsideSummaryCount,
    rows,
    airedCount: aired.length,
    certificationSentence: certificationSentence(aired.length),
  };
}

/** The certified PDF's object path in the underwriting-documents bucket. */
export function certifiedAffidavitObjectPath(affidavitId: string): string {
  return `affidavits/${affidavitId}.pdf`;
}

/** A filesystem-safe download name, e.g. "WUWF affidavit 2026-001-2026-03-01-2026-03-31.pdf". */
export function affidavitFileName(reportIdentifier: string): string {
  return `WUWF affidavit ${reportIdentifier.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;
}

// Which contracts are due an affidavit ----------------------------------------

/** The last day of the month before `today` (both YYYY-MM-DD). */
export function endOfPreviousMonth(today: string): string {
  return shiftDateISO(`${today.slice(0, 7)}-01`, -1);
}

/**
 * The period a contract's next affidavit would cover, or null if nothing is
 * due yet. Affidavits run monthly: the next one starts the day after the
 * latest one ends (or on the contract's start) and closes at the end of last
 * month — or at the contract's own end, once that has passed. A draft
 * contract has aired nothing. The caller still checks that something aired
 * in the period before listing it.
 */
export function nextAffidavitPeriod(contract: {
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  coveredThrough: string | null;
  today: string;
}): { start: string; end: string } | null {
  if (contract.status === "draft") return null;
  const start = contract.coveredThrough
    ? shiftDateISO(contract.coveredThrough, 1)
    : contract.effectiveFrom;
  // A contract that has ended is due through its last day; one still
  // running, through the end of last month.
  const ended = contract.effectiveTo !== null && contract.effectiveTo < contract.today;
  const end = ended ? contract.effectiveTo! : endOfPreviousMonth(contract.today);
  return end >= start ? { start, end } : null;
}
