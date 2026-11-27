import Link from 'next/link'
import React from 'react'

import { eventIsFull, hubEventMeta, hubSessions } from '@/lib/listening/event'
import type { HubLoad } from '@/lib/listening/load'

import { SectionBand } from '../SectionBand'
import { outlineButton } from '../listening-parts'
import { cardClass } from '../listening-parts'
import type { SectionData, SectionProps } from '../types'

export type ListeningSessionsData = SectionData

/**
 * Coming up: every listed public session, soonest first, each with the question it talks over. A pure view over what the Portal answered, so it is tested with
 * fixtures. It draws nothing when no session is listed.
 */
export function ListeningSessionsView({ block, load }: { block: ListeningSessionsData; load: HubLoad | undefined }) {
  if (!load || load.kind !== 'ok') return null
  const hub = load.hub
  const sessions = hubSessions(hub)
  if (sessions.length === 0) return null
  const titles = new Map(hub.open.map((question) => [question.publicId, question.title]))

  return (
    <SectionBand block={block} heading={block.heading}>
      <ul className="m-0 flex max-w-3xl list-none flex-col gap-3 p-0">
        {sessions.map((item) => {
          const about = item.queryPublicId ? titles.get(item.queryPublicId) : undefined
          return (
            <li className={`flex flex-wrap items-center gap-x-6 gap-y-3 px-6 py-5 ${cardClass}`} key={item.publicId}>
              <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                <span className="font-serif text-xl font-semibold leading-snug">{item.organizerLabel ? `${item.title}, hosted by ${item.organizerLabel}` : item.title}</span>
                <span className="text-sm [color:var(--tone-muted)]">{hubEventMeta(item)}</span>
                {about && item.queryPublicId && (
                  <span className="text-sm [color:var(--tone-muted)]">
                    About:{' '}
                    <Link className="font-semibold [color:var(--tone-accent)]" href={`/listens/${item.queryPublicId}`}>
                      {about}
                    </Link>
                  </span>
                )}
              </div>
              <Link className={outlineButton} href={`/listens/events/${item.publicId}`}>
                {eventIsFull(item) ? 'See the session' : 'Save a seat'}
              </Link>
            </li>
          )
        })}
      </ul>
    </SectionBand>
  )
}

/** Coming up. Draws nothing without the hub, or with nothing to offer. */
export async function ListeningSessionsSection({ block, context }: SectionProps<ListeningSessionsData>) {
  return <ListeningSessionsView block={block} load={context.listeningHub} />
}
