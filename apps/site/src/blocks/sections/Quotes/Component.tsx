import React from 'react'

import { SectionBand, SectionHeading } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export interface QuotesData extends SectionData {
  quotes?: Array<{ id?: string | null; quote?: string | null; name?: string | null; role?: string | null } | null> | null
}

/** Quotes. A row needs its words; the name and role are optional. Draws nothing when no row has words. */
export function QuotesSection({ block }: SectionProps<QuotesData>) {
  const rows = (block.quotes ?? []).filter((q): q is NonNullable<typeof q> => Boolean(q?.quote?.trim()))
  if (rows.length === 0) return null
  return (
    <SectionBand block={block}>
      <SectionHeading heading={block.heading} />
      <ul className="grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((q, i) => {
          const name = q.name?.trim()
          const role = q.role?.trim()
          return (
            <li key={q.id ?? `${q.quote}-${i}`}>
              <figure className="flex h-full flex-col gap-4 rounded-sm border-l-4 py-1 pl-5 [border-color:var(--tone-rule)]">
                <blockquote className="font-serif text-xl leading-snug">{`“${q.quote!.trim()}”`}</blockquote>
                {(name || role) && (
                  <figcaption className="mt-auto flex flex-col text-base">
                    {name && <strong>{name}</strong>}
                    {role && <span className="[color:var(--tone-muted)]">{role}</span>}
                  </figcaption>
                )}
              </figure>
            </li>
          )
        })}
      </ul>
    </SectionBand>
  )
}
