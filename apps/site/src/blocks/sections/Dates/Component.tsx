import React from 'react'

import { datesSpecOf } from '@/lib/section-data/specs'
import { datePartsOf, typedDateItem, upcomingDates, type DateItem } from '@/lib/section-data/shape'

import { SectionBand, SectionHeading } from '../SectionBand'
import { SectionLink } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface DatesData extends SectionData {
  source?: string | null
  count?: number | null
  actionLabel?: string | null
  items?: unknown[] | null
}

/** Rows or cards over dates that are already known to be upcoming. Draws nothing without one. */
export function DatesView({ block, items }: { block: DatesData; items: readonly DateItem[] }) {
  if (items.length === 0) return null
  const action = block.actionLabel?.trim() || 'Details'
  const cards = block.variant === 'cards'
  const entries = items.map((item) => ({ item, when: datePartsOf(item.startsAt) }))
  const details = (e: (typeof entries)[number]) => [e.when.weekday, e.when.time, e.item.place].filter(Boolean).join(' · ')
  return (
    <SectionBand block={block}>
      <SectionHeading heading={block.heading} />
      {cards ? (
        <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <li className="flex flex-col gap-2 rounded-sm border p-5 [border-color:var(--tone-rule)]" key={e.item.id}>
              <p className="text-sm font-bold uppercase tracking-wider [color:var(--tone-muted)]">
                <time dateTime={e.item.startsAt}>
                  {e.when.month} {e.when.day}
                </time>
              </p>
              <h3 className="font-serif text-xl font-bold">{e.item.title}</h3>
              <p>{details(e)}</p>
              <SectionLink className="mt-auto" href={e.item.href} label={action} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex max-w-4xl list-none flex-col p-0">
          {entries.map((e) => (
            <li className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t py-4 last:border-b [border-color:var(--tone-rule)]" key={e.item.id}>
              <time className="flex w-16 shrink-0 flex-col items-center leading-none" dateTime={e.item.startsAt}>
                <span className="text-sm font-bold uppercase tracking-wider [color:var(--tone-muted)]">{e.when.month}</span>
                <span className="font-serif text-4xl font-bold">{e.when.day}</span>
              </time>
              <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
                <h3 className="font-serif text-xl font-bold">{e.item.title}</h3>
                <p>{details(e)}</p>
              </div>
              <SectionLink href={e.item.href} label={action} />
            </li>
          ))}
        </ul>
      )}
    </SectionBand>
  )
}

/** Dates. Reads the clock through the short cache (so the page is cached for no longer than it) and keeps only dates still to come. */
export async function DatesSection({ block }: SectionProps<DatesData>) {
  const spec = datesSpecOf(block)
  if (!spec) return null
  const { loadDates, sectionClock } = await import('@/lib/section-data/load')
  if (spec.source === 'typed') {
    const now = new Date(await sectionClock())
    const rows = (block.items ?? []).map((r, i) => typedDateItem(r, i))
    return <DatesView block={block} items={upcomingDates(rows, now, spec.count)} />
  }
  return <DatesView block={block} items={await loadDates(spec)} />
}
