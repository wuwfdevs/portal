// The Affidavits page as one list per month (docs/underwriting-traffic-
// redesign.md §17): one row per contract, whose action follows its state —
// Generate, then Sign, then Signed. Pure, so the month arithmetic, the row
// merge and the signing order are tested without Supabase.
//
// One row per contract per month. What a contract still owes in the month
// (lib/underwriting/affidavits.ts's dueAffidavitRanges, month-bounded, with
// something aired) and the affidavits already generated for it there are
// merged into that one row: the newest affidavit sets its state — "sign"
// while a draft, "signed" once certified — with older ones as its earlier
// versions, and any range still owed rides along as `due`, so a hand-made
// half-month affidavit leaves one row with a Generate for the rest rather
// than a second row. A row with no affidavit yet is a "generate" row. An
// affidavit belongs to the month its period ends in.

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
  /** Ranges in this month the contract still owes an affidavit for, in date order. */
  due: { periodStart: string; periodEnd: string; airedCount: number }[];
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
  const byContract = new Map<
    string,
    { contract: C; affidavits: AffidavitInput<C>[]; due: DueInput<C>[] }
  >();
  const entry = (contract: C) => {
    const existing = byContract.get(contract.id);
    if (existing) return existing;
    const created = { contract, affidavits: [] as AffidavitInput<C>[], due: [] as DueInput<C>[] };
    byContract.set(contract.id, created);
    return created;
  };
  for (const affidavit of affidavits) {
    if (monthOf(affidavit.campaignPeriodEnd) === month)
      entry(affidavit.contract).affidavits.push(affidavit);
  }
  for (const item of due) {
    if (monthOf(item.periodEnd) === month) entry(item.contract).due.push(item);
  }

  const rows: AffidavitMonthRow<C>[] = [];
  for (const { contract, affidavits: generated, due: owed } of byContract.values()) {
    generated.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    owed.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
    const [latest, ...earlier] = generated;
    const dueRanges = owed.map(({ periodStart, periodEnd, airedCount }) => ({
      periodStart,
      periodEnd,
      airedCount,
    }));
    rows.push(
      latest
        ? {
            key: latest.id,
            state: latest.status === "certified" ? "signed" : "sign",
            contract,
            periodStart: latest.campaignPeriodStart,
            periodEnd: latest.campaignPeriodEnd,
            airedCount: latest.airedCount,
            affidavit: latest,
            earlier,
            due: dueRanges,
          }
        : {
            key: `due-${contract.id}`,
            state: "generate",
            contract,
            periodStart: owed[0]!.periodStart,
            periodEnd: owed.at(-1)!.periodEnd,
            airedCount: owed.reduce((sum, item) => sum + item.airedCount, 0),
            affidavit: null,
            earlier: [],
            due: dueRanges,
          },
    );
  }

  return rows.sort(
    (a, b) =>
      Number(b.contract.affidavitRequired) - Number(a.contract.affidavitRequired) ||
      a.contract.underwriterName.localeCompare(b.contract.underwriterName),
  );
}

/** Rows with something still to generate, a draft to sign, or a signed affidavit — a row with a partial affidavit and a remainder owed counts twice. */
export function countAffidavitStates(
  rows: readonly { state: AffidavitRowState; due: readonly unknown[] }[],
): Record<AffidavitRowState, number> {
  const counts: Record<AffidavitRowState, number> = { generate: 0, sign: 0, signed: 0 };
  for (const row of rows) {
    if (row.due.length > 0) counts.generate += 1;
    if (row.state !== "generate") counts[row.state] += 1;
  }
  return counts;
}

/** Every range still owed across the month's rows — what "Generate N" submits. */
export function dueRangesToGenerate<C extends AffidavitMonthContract>(
  rows: readonly AffidavitMonthRow<C>[],
): { contractId: string; periodStart: string; periodEnd: string }[] {
  return rows.flatMap((row) => row.due.map((range) => ({ contractId: row.contract.id, ...range })));
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
