// The on-air rate card's arithmetic (board 17). Pure. The numbers are the admin's (Sponsorship settings → On-air rates); this only reads them.

import { formatMoney, percentOff } from './money'

export const TERMS = [
  { key: 'open', label: 'Open' },
  { key: '3m', label: '3 months' },
  { key: '6m', label: '6 months' },
  { key: '1y', label: '1 year' },
] as const
export type TermKey = (typeof TERMS)[number]['key']

export type RateRow = { key: string; label: string; when: string; /** Cents per credit: open, 3 months, 6 months, 1 year. */ cents: readonly [number, number, number, number] }
export type RateCard = { rows: RateRow[]; counts: number[]; prepayPercent: number; nonprofitPercent: number }

export const toCents = (dollars: number | null | undefined): number => Math.round((dollars ?? 0) * 100)

/** What the rate card reads from the settings global: the daypart rows, the schedule sizes and the two percentages. */
export type Rates = {
  dayparts?: Array<{ label?: string | null; when?: string | null; open?: number | null; m3?: number | null; m6?: number | null; y1?: number | null }> | null
  creditCounts?: Array<{ count?: number | null }> | null
  prepayPercent?: number | null
  nonprofitPercent?: number | null
}

/** The rate card from the admin's rows: rows with a name and four prices, counts that are whole positive numbers. */
export function rateCard(rates: Rates | null | undefined): RateCard {
  const rows: RateRow[] = []
  for (const [i, d] of (rates?.dayparts ?? []).entries()) {
    const label = d.label?.trim()
    if (!label || [d.open, d.m3, d.m6, d.y1].some((v) => typeof v !== 'number')) continue
    rows.push({ key: `${i}-${label}`, label, when: d.when?.trim() ?? '', cents: [toCents(d.open), toCents(d.m3), toCents(d.m6), toCents(d.y1)] })
  }
  const counts = (rates?.creditCounts ?? []).map((c) => c.count).filter((n): n is number => Number.isInteger(n) && (n as number) > 0)
  return { rows, counts, prepayPercent: rates?.prepayPercent ?? 0, nonprofitPercent: rates?.nonprofitPercent ?? 0 }
}

export const lowestCredit = (card: RateCard): number | null => (card.rows.length ? Math.min(...card.rows.flatMap((r) => [...r.cents])) : null)

export type Estimate = { title: string; total: string; detail: string; prepaid: string; nonprofit: string }

/** The estimate the page shows: a starting point only, WUWF confirms every schedule. The nonprofit rate applies to open rates only. */
export function estimateSchedule(card: RateCard, input: { row: string; term: TermKey; credits: number }): Estimate | null {
  const row = card.rows.find((r) => r.key === input.row)
  const term = TERMS.findIndex((t) => t.key === input.term)
  if (!row || term < 0 || !card.counts.includes(input.credits)) return null
  const unit = row.cents[term] as number
  const total = unit * input.credits
  return {
    title: `${row.label} · ${TERMS[term]!.label}`,
    total: formatMoney(total),
    detail: `${input.credits} credits at ${formatMoney(unit)} each`,
    prepaid: `Prepaid: ${formatMoney(percentOff(total, card.prepayPercent))} (${card.prepayPercent}% additional discount).`,
    nonprofit:
      input.term === 'open'
        ? `Nonprofit rate: ${formatMoney(percentOff(total, card.nonprofitPercent))} (${card.nonprofitPercent}% off open rates).`
        : `The nonprofit rate (${card.nonprofitPercent}% off) applies to open rates.`,
  }
}

/** Every price in a row must not rise with a longer commitment: a row that does is a typing mistake the admin should hear about. */
export const commitmentNeverCostsMore = (cents: readonly number[]): boolean => cents.every((c, i) => i === 0 || c <= (cents[i - 1] as number))
