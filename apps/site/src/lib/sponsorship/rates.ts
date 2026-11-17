// The on-air rate card (board 17, "By the credit") and the pure estimate over it. Pure: no Payload, no React.
//
// Source: WUWF Media Kit 2026. The effective date is still to be confirmed by corporate support, so the page does not print one.
// The daypart rows follow the board. Traffic (the Portal) names dayparts too; if its names for the weekend rows differ, change
// `label` here, never `key` (the key is the stable reference).

import { formatMoney, percentOff } from './money'

export const TERMS = [
  { key: 'open', label: 'Open' },
  { key: '3m', label: '3 months' },
  { key: '6m', label: '6 months' },
  { key: '1y', label: '1 year' },
] as const

export type TermKey = (typeof TERMS)[number]['key']

export type Daypart = {
  key: string
  label: string
  when: string
  /** Price per credit in cents, in the order of `TERMS`: open, 3 months, 6 months, 1 year. */
  cents: readonly [number, number, number, number]
}

export const DAYPARTS: readonly Daypart[] = [
  { key: 'morning-drive', label: 'Morning Drive', when: 'Mon–Fri, 6–9 a.m.', cents: [5500, 5000, 4600, 4400] },
  { key: 'afternoon-drive', label: 'Afternoon Drive', when: 'Mon–Fri, 3–7 p.m.', cents: [5500, 5000, 4600, 4400] },
  { key: 'midday', label: 'Midday', when: 'Mon–Fri, 9 a.m.–3 p.m.', cents: [4000, 3600, 3400, 3000] },
  { key: 'weekend-morning', label: 'Weekend morning', when: 'Sat–Sun, 6–10 a.m.', cents: [3800, 3400, 3200, 2800] },
  { key: 'weekend-midday', label: 'Weekend midday', when: 'Sat–Sun, 10 a.m.–4 p.m.', cents: [3300, 2900, 2800, 2600] },
  { key: 'weekend-afternoon', label: 'Weekend afternoon', when: 'Sat–Sun, 4–7 p.m.', cents: [3300, 2900, 2800, 2600] },
  { key: 'total-program-rotation', label: 'Total Program Rotation', when: 'Rotates through day and evening programming', cents: [3000, 2700, 2550, 2300] },
]

/** How many credits a schedule can ask for in the estimate. */
export const CREDIT_COUNTS = [13, 26, 52, 104] as const

export const PREPAY_PERCENT = 5
export const NONPROFIT_PERCENT = 20

export function daypart(key: string): Daypart | undefined {
  return DAYPARTS.find((d) => d.key === key)
}

export function rateCents(d: Daypart, term: TermKey): number {
  return d.cents[TERMS.findIndex((t) => t.key === term)] as number
}

export type Estimate = {
  title: string
  totalCents: number
  total: string
  detail: string
  prepaid: string
  nonprofit: string
}

/** The estimate the page shows: a starting point only, WUWF confirms every schedule. The nonprofit rate applies to open rates only. */
export function estimateSchedule(input: { daypart: string; term: TermKey; credits: number }): Estimate | null {
  const d = daypart(input.daypart)
  const term = TERMS.find((t) => t.key === input.term)
  if (!d || !term || !(CREDIT_COUNTS as readonly number[]).includes(input.credits)) return null
  const unit = rateCents(d, term.key)
  const total = unit * input.credits
  return {
    title: `${d.label} · ${term.label}`,
    totalCents: total,
    total: formatMoney(total),
    detail: `${input.credits} credits at ${formatMoney(unit)} each`,
    prepaid: `Prepaid: ${formatMoney(percentOff(total, PREPAY_PERCENT))} (${PREPAY_PERCENT}% additional discount).`,
    nonprofit:
      term.key === 'open'
        ? `Nonprofit rate: ${formatMoney(percentOff(total, NONPROFIT_PERCENT))} (${NONPROFIT_PERCENT}% off open rates).`
        : `The nonprofit rate (${NONPROFIT_PERCENT}% off) applies to open rates.`,
  }
}
