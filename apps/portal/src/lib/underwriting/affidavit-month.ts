// The Affidavits page as one list per month (docs/underwriting-traffic-
// redesign.md §17): one row per contract, whose action follows its state —
// Generate, then Sign, then Signed. Pure, so the month arithmetic, the row
// merge and the signing order are tested without Supabase.
//
// A row belongs to the month its period ends in. A contract owed an
// affidavit (lib/underwriting/affidavits.ts's nextAffidavitPeriod, with
// something aired in it) is a "generate" row; once generated, the newest
// affidavit for that contract in the month is the row — "sign" while it's a
// draft, "signed" once certified — and any earlier ones for the same month
// are its earlier versions.

import { endOfPreviousMonth } from "./affidavits";

export type AffidavitRowState = "generate" | "sign" | "signed";

export interface AffidavitMonthContract {
  id: string;
  underwriterName: string;
  affidavitRequired: boolean;
}

export interface DueInput<C extends AffidavitMonthContract> {
  contract: C;
  periodStart: string;
  periodEnd: string;
  airedCount: number;
}

export interface AffidavitInput<C extends AffidavitMonthContract> {
  id: string;
  contract: C;
  status: "draft" | "certified";
  campaignPeriodStart: string;
  campaignPeriodEnd: string;
  generatedAt: string;
  certifiedAt: string | null;
  airedCount: number;
}

export interface AffidavitMonthRow<C extends AffidavitMonthContract> {
  key: string;
  state: AffidavitRowState;
  contract: C;
  periodStart: string;
  periodEnd: string;
  airedCount: number;
  /** The affidavit behind a sign/signed row. */
  affidavit: AffidavitInput<C> | null;
  /** Older affidavits for the same contract in this month, newest first — a correction's earlier versions. */
  earlier: AffidavitInput<C>[];
}

/** "2026-09" for any date in September 2026. */
export function monthOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

/** The month the page opens on: last month, the one being worked. */
export function defaultAffidavitMonth(today: string): string {
  return monthOf(endOfPreviousMonth(today));
}

export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(month: string, by: number): string {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (mon - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * Every row for one month, ordered so a row keeps its place as it moves
 * from Generate to Sign to Signed: orders that require an affidavit first,
 * then by underwriter.
 */
export function buildAffidavitMonth<C extends AffidavitMonthContract>(
  month: string,
  due: readonly DueInput<C>[],
  affidavits: readonly AffidavitInput<C>[],
): AffidavitMonthRow<C>[] {
  const rows: AffidavitMonthRow<C>[] = [];

  const byContract = new Map<string, AffidavitInput<C>[]>();
  for (const affidavit of affidavits) {
    if (monthOf(affidavit.campaignPeriodEnd) !== month) continue;
    const list = byContract.get(affidavit.contract.id) ?? [];
    list.push(affidavit);
    byContract.set(affidavit.contract.id, list);
  }
  for (const list of byContract.values()) {
    list.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    const [latest, ...earlier] = list as [AffidavitInput<C>, ...AffidavitInput<C>[]];
    rows.push({
      key: latest.id,
      state: latest.status === "certified" ? "signed" : "sign",
      contract: latest.contract,
      periodStart: latest.campaignPeriodStart,
      periodEnd: latest.campaignPeriodEnd,
      airedCount: latest.airedCount,
      affidavit: latest,
      earlier,
    });
  }

  for (const item of due) {
    if (monthOf(item.periodEnd) !== month) continue;
    rows.push({
      key: `due-${item.contract.id}`,
      state: "generate",
      contract: item.contract,
      periodStart: item.periodStart,
      periodEnd: item.periodEnd,
      airedCount: item.airedCount,
      affidavit: null,
      earlier: [],
    });
  }

  return rows.sort(
    (a, b) =>
      Number(b.contract.affidavitRequired) - Number(a.contract.affidavitRequired) ||
      a.contract.underwriterName.localeCompare(b.contract.underwriterName) ||
      a.periodStart.localeCompare(b.periodStart),
  );
}

export function countAffidavitStates(
  rows: readonly { state: AffidavitRowState }[],
): Record<AffidavitRowState, number> {
  const counts: Record<AffidavitRowState, number> = { generate: 0, sign: 0, signed: 0 };
  for (const row of rows) counts[row.state] += 1;
  return counts;
}

/** Months other than `month` that still have something to generate, oldest first. */
export function otherMonthsOwed(
  month: string,
  due: readonly { periodEnd: string }[],
): { month: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of due) {
    const key = monthOf(item.periodEnd);
    if (key !== month) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ month: key, count }));
}

/** The drafts to sign in a month, in the page's order — the signing view's queue. */
export function signingQueue<C extends AffidavitMonthContract>(
  rows: readonly AffidavitMonthRow<C>[],
): string[] {
  return rows.flatMap((row) => (row.state === "sign" && row.affidavit ? [row.affidavit.id] : []));
}
