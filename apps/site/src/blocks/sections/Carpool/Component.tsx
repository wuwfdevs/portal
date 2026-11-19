import React from 'react'

import { formatMoney } from '@/lib/sponsorship/money'
import { perMonth } from '@/lib/sponsorship/packages'
import { toCents } from '@/lib/sponsorship/rates'

import { SectionBand, SectionHeading } from '../SectionBand'
import { SectionActions, type ActionData } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface CarpoolData extends SectionData {
  perDayNote?: string | null
  slotsNote?: string | null
  actions?: Array<ActionData | null> | null
}

/** Carpool plan. Reads the two prices from the Sponsorship settings and draws nothing without a six-month or a one-year price. */
export async function CarpoolSection({ block }: SectionProps<CarpoolData>) {
  const { loadSponsorshipSettings } = await import('@/lib/sponsorship/load')
  const { settings } = await loadSponsorshipSettings()
  const six = settings.carpool?.sixMonths
  const year = settings.carpool?.oneYear
  const prices = [
    typeof six === 'number' ? { key: 'six', price: six, months: 6, label: '6 months', note: '' } : null,
    typeof year === 'number' ? { key: 'year', price: year, months: 12, label: '1 year', note: block.perDayNote?.trim() ?? '' } : null,
  ].filter((p): p is NonNullable<typeof p> => p !== null)
  if (prices.length === 0) return null
  const slots = block.slotsNote?.trim()
  return (
    <SectionBand block={block}>
      <SectionHeading heading={block.heading} />
      <dl className="grid gap-4 sm:grid-cols-2">
        {prices.map((p) => (
          <div className="flex flex-col gap-1 rounded-sm border border-rule-strong bg-surface p-5 text-ink" key={p.key}>
            <dd className="order-1 font-serif text-4xl font-bold">{formatMoney(toCents(p.price))}</dd>
            <dt className="order-2 text-sm font-normal text-ink-2">
              {p.label} · {perMonth(p.price, p.months)} a month{p.note ? `, ${p.note}` : ''}
            </dt>
          </div>
        ))}
      </dl>
      {slots && <p className="text-base">{slots}</p>}
      <SectionActions actions={block.actions} />
    </SectionBand>
  )
}
