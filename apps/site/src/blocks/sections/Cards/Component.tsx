import Link from 'next/link'
import React from 'react'

import { safeHref } from '@/lib/section-links'
import { cn } from '@/utilities/ui'

import { SectionBand } from '../SectionBand'
import { SectionLink, SectionMore, eyebrowClass } from '../parts'
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
  note?: string | null
  moreLabel?: string | null
  moreHref?: string | null
}

/** Cards. Draws nothing when no card has a title. A link is drawn only when its address passes `safeHref`. */
export function CardsSection({ block }: SectionProps<CardsData>) {
  const cards = (block.cards ?? []).filter((c): c is NonNullable<typeof c> => Boolean(c?.title?.trim()))
  if (cards.length === 0) return null
  return (
    <SectionBand block={block} heading={block.heading} more={<SectionMore block={block} />}>
      <ul className={cn('grid list-none gap-6 p-0 sm:grid-cols-2', cards.length === 2 ? 'lg:grid-cols-2' : cards.length % 4 === 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        {cards.map((card, i) => {
          const href = safeHref(card.href)
          const price = card.price?.trim()
          // A card with a price and no words for its link uses the price as the link ("From $23 a credit →"): the card is one place to go.
          const label = card.linkLabel?.trim() || (price ? (/[→›»]$/.test(price) ? price : `${price} →`) : 'Read more')
          const priceIsLink = Boolean(href) && !card.linkLabel?.trim() && Boolean(price)
          return (
            <li key={card.id ?? i} className="flex flex-col gap-2 rounded-lg border p-6 [background-color:var(--tone-card)] [border-color:var(--tone-card-rule)]">
              {card.tag?.trim() && <p className={eyebrowClass}>{card.tag}</p>}
              <h3 className="font-serif text-[1.375rem] font-bold leading-tight">{card.title}</h3>
              {card.text?.trim() && <p className="text-base [color:var(--tone-muted)]">{card.text}</p>}
              {price && !priceIsLink && <p className="mt-auto pt-2 font-bold [color:var(--tone-accent)]">{price}</p>}
              <SectionLink className={cn('mt-auto', price && !priceIsLink && 'mt-0')} href={href} label={label} />
            </li>
          )
        })}
      </ul>
      {block.note?.trim() && <p className="max-w-4xl text-sm [color:var(--tone-muted)]">{block.note}</p>}
    </SectionBand>
  )
}
