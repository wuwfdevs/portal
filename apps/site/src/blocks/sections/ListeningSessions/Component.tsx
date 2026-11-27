import Link from 'next/link'
import React from 'react'

import type { KitchenTable as KitchenTableForm } from '@/components/Listening/KitchenTable'
import { hubEventMeta } from '@/lib/listening/event'
import { hubLayout } from '@/lib/listening/hub'
import type { HubLoad } from '@/lib/listening/load'

import { SectionBand } from '../SectionBand'
import { eyebrowClass } from '../parts'
import { cardClass, lightFormCard, outlineButton } from '../listening-parts'
import type { SectionData, SectionProps } from '../types'

export type ListeningSessionsData = SectionData

/** Sessions and tables. A pure view over what the Portal answered, so it is tested with fixtures. */
export function ListeningSessionsView({ block, load, KitchenTable }: { block: ListeningSessionsData; load: HubLoad | undefined; KitchenTable: typeof KitchenTableForm }) {
  if (!load || load.kind !== 'ok') return null
  const { sessions, tables } = hubLayout(load.hub)

  if (block.variant === 'tables') {
    if (tables.length === 0) return null
    return (
      <SectionBand block={block} heading={block.heading}>
        <div className="flex flex-col gap-10">
          {tables.map((question) => (
            <div className={lightFormCard} key={question.publicId}>
              <KitchenTable query={{ publicId: question.publicId, title: question.title }} />
            </div>
          ))}
        </div>
      </SectionBand>
    )
  }

  if (sessions.length === 0) return null
  return (
    <SectionBand block={block} heading={block.heading}>
      <ul className="grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        {sessions.map((item) => (
          <li className={`flex flex-col gap-2.5 p-5 ${cardClass}`} key={item.publicId}>
            {item.organizerLabel && <span className={eyebrowClass}>Hosted by {item.organizerLabel}</span>}
            <span className="flex-auto font-serif text-[1.3125rem] font-semibold leading-snug">{item.title}</span>
            <span className="text-sm [color:var(--tone-muted)]">{hubEventMeta(item)}</span>
            <Link className={outlineButton} href={`/listens/events/${item.publicId}`}>
              {item.seatsLeft !== null && item.seatsLeft <= 0 ? 'See the session' : 'Save a seat'}
            </Link>
          </li>
        ))}
      </ul>
    </SectionBand>
  )
}

/** Sessions and tables. Draws nothing without the hub, or with nothing to offer. */
export async function ListeningSessionsSection({ block, context }: SectionProps<ListeningSessionsData>) {
  const { KitchenTable } = await import('@/components/Listening/KitchenTable')
  return <ListeningSessionsView KitchenTable={KitchenTable} block={block} load={context.listeningHub} />
}
