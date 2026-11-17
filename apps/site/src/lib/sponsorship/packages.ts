// Ready-made on-air packages for first-time sponsors, the Carpool Plan, and the programs a sponsor can pick (board 17).
// Pure data plus the arithmetic that keeps it honest (packages.test.ts checks every total against the rate card).

import { formatMoney } from './money'

/** What first-time sponsors pay for a drive-time credit that normally costs $55 (25% off). */
export const NEW_SPONSOR_DRIVE_CENTS = 4125
export const DRIVE_TIME_OPEN_CENTS = 5500

export type NewSponsorPackage = {
  key: string
  number: number
  name: string
  description: string
  priceCents: number
  valueCents: number
}

export const NEW_SPONSOR_PACKAGES: readonly NewSponsorPackage[] = [
  {
    key: 'drive-all-the-time',
    number: 1,
    name: 'Drive All the Time',
    description: '52 credits in the morning and afternoon news hours, 6–9 a.m. or 3–7 p.m.',
    priceCents: 214500,
    valueCents: 286000,
  },
  {
    key: 'drive-time-plan-plus',
    number: 2,
    name: 'Drive Time Plan Plus',
    description: '26 drive-time credits, plus 26 Total Program Rotation credits that air any time from 6 a.m. to 7 p.m.',
    priceCents: 156650,
    valueCents: 221000,
  },
  {
    key: 'all-day-plan',
    number: 3,
    name: 'All Day Plan',
    description: '13 morning drive credits (6–9 a.m.), one program sponsored for 13 weeks, and 13 afternoon drive credits (3–7 p.m.).',
    priceCents: 146250,
    valueCents: 195000,
  },
  {
    key: 'total-audience-plan',
    number: 4,
    name: 'Total Audience Plan',
    description: 'Our easiest first step: 26 credits between 6 a.m. and 7 p.m., on the days you choose.',
    priceCents: 50000,
    valueCents: 78000,
  },
]

export const savings = (p: NewSponsorPackage): number => p.valueCents - p.priceCents

export function newSponsorPackage(key: string): NewSponsorPackage {
  const found = NEW_SPONSOR_PACKAGES.find((p) => p.key === key)
  if (!found) throw new Error(`No new-sponsor package "${key}".`)
  return found
}

/** "$2,145" and "A $2,860 value. You save $715." */
export const packagePrice = (p: NewSponsorPackage): string => formatMoney(p.priceCents)
export const packageValueLine = (p: NewSponsorPackage): string => `A ${formatMoney(p.valueCents)} value. You save ${formatMoney(savings(p))}.`

export const CARPOOL = {
  words: 20,
  sixMonthsCents: 71500,
  oneYearCents: 143000,
} as const

/** What a Carpool Plan costs each month, to the nearest cent. */
export const carpoolPerMonth = (totalCents: number, months: number): string => formatMoney(Math.round(totalCents / months))

/** Programs a sponsor can pick for a 13-week program sponsorship. */
export const SPONSORABLE_PROGRAMS: readonly string[] = ['1A', 'Fresh Air', 'On the Media', 'TED Radio Hour', 'This American Life', 'Living on Earth', 'Here & Now', 'Science Friday']
