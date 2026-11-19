import Link from 'next/link'
import React from 'react'

import { isInternalHref, safeHref } from '@/lib/section-links'

import { SectionBand, SectionHeading } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export interface CardsData extends SectionData {
  cards?: Array<{
    id?: string | null
    title?: string | null
    text?: string | null
    tag?: string | null
    price?: string | null
    href?: string | null
    linkLabel?: string | null
  } | null> | null
}

/** Cards. Draws nothing when no card has a title. A link is drawn only when its address passes `safeHref`. */
export function CardsSection({ block }: SectionProps<CardsData>) {
  const cards = (block.cards ?? []).filter((c): c is NonNullable<typeof c> => Boolean(c?.title?.trim()))
  if (cards.length === 0) return null
  return (
    <SectionBand block={block}>
      <SectionHeading heading={block.heading} />
      <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, i) => {
          const href = safeHref(card.href)
          const label = card.linkLabel?.trim() || 'Read more'
          return (
            <li key={card.id ?? i} className="flex flex-col gap-3 rounded-sm border p-6 [border-color:var(--tone-rule)]">
              {card.tag?.trim() && <p className="text-sm font-bold uppercase tracking-wider [color:var(--tone-muted)]">{card.tag}</p>}
              <h3 className="font-serif text-xl font-bold">{card.title}</h3>
              {card.text?.trim() && <p>{card.text}</p>}
              {card.price?.trim() && <p className="font-bold">{card.price}</p>}
              {href &&
                (isInternalHref(href) ? (
                  <Link className="mt-auto inline-flex min-h-11 items-center font-bold underline" href={href}>
                    {label}
                  </Link>
                ) : (
                  <a className="mt-auto inline-flex min-h-11 items-center font-bold underline" href={href} rel="noopener noreferrer">
                    {label}
                  </a>
                ))}
            </li>
          )
        })}
      </ul>
    </SectionBand>
  )
}
