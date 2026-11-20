import Link from 'next/link'
import React from 'react'

import type { KitchenTable as KitchenTableForm } from '@/components/Listening/KitchenTable'
import { hubEventMeta } from '@/lib/listening/event'
import { bandLabel, deskLabel, hubLayout, openMeta } from '@/lib/listening/hub'
import type { HubLoad } from '@/lib/listening/load'

import { SectionBand } from '../SectionBand'
import { eyebrowClass } from '../parts'
import { cardClass, hubProblem, lightFormCard, outlineButton } from '../listening-parts'
import type { SectionData, SectionProps } from '../types'

export interface ListeningOpenData extends SectionData {
  emptyText?: string | null
  tableText?: string | null
  voiceOnlyIntro?: string | null
}

/** A campaign's ways in sit in one row from a tablet up, one column on a phone: the class is chosen by how many there are. */
const TILE_COLUMNS = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3']
const tile = 'flex flex-col gap-2 rounded-md p-[18px] [background:var(--tone-tint)]'

/** Open questions. A pure view over what the Portal answered, so it is tested with fixtures. */
export function ListeningOpenView({ block, load, KitchenTable }: { block: ListeningOpenData; load: HubLoad | undefined; KitchenTable: typeof KitchenTableForm }) {
  if (!load) return null
  const reporters = block.variant === 'reporters'
  const problem = hubProblem(load)
  if (problem) {
    // One band says it (the campaigns one), so a page holding both does not say it twice.
    return reporters ? null : (
      <SectionBand block={block} heading={block.heading}>
        <p className="max-w-2xl text-lg [color:var(--tone-muted)]">{problem}</p>
      </SectionBand>
    )
  }
  if (load.kind !== 'ok') return null
  const hub = load.hub
  const { bands, questions, sessions, tables } = hubLayout(hub)

  if (reporters) {
    if (questions.length === 0) return null
    const writtenToo = questions.some((item) => item.allowTextAnswers)
    const heading = { ...block.heading, intro: writtenToo ? block.heading?.intro : block.voiceOnlyIntro?.trim() || block.heading?.intro }
    return (
      <SectionBand block={block} heading={heading}>
        <ul className="grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
          {questions.map((item) => (
            <li className={`flex flex-col gap-2.5 p-5 ${cardClass}`} key={item.publicId}>
              {deskLabel(item) && <span className={eyebrowClass}>{deskLabel(item)}</span>}
              <span className="flex-auto font-serif text-[1.3125rem] font-semibold leading-snug">{item.title}</span>
              <span className="text-sm [color:var(--tone-muted)]">{openMeta(item)}</span>
              <Link className={outlineButton} href={`/listens/${item.publicId}`}>
                Answer
              </Link>
            </li>
          ))}
        </ul>
      </SectionBand>
    )
  }

  const empty = bands.length === 0 && questions.length === 0 && hub.answered.length === 0 && sessions.length === 0 && tables.length === 0
  if (empty) {
    const text = block.emptyText?.trim()
    return text ? (
      <SectionBand block={block}>
        <p className="max-w-2xl text-lg [color:var(--tone-muted)]">{text}</p>
      </SectionBand>
    ) : null
  }
  if (bands.length === 0) return null
  return (
    <SectionBand block={block} heading={block.heading}>
      <div className="flex flex-col gap-6">
        {bands.map(({ campaign, question, sessions: bandSessions, table }) => (
          <article
            aria-labelledby={`campaign-${campaign.publicId}-title`}
            className="flex flex-col gap-5 rounded-lg border-2 p-5 [background:var(--tone-card)] [border-color:var(--tone-text)] md:p-8"
            id={`campaign-${campaign.publicId}`}
            key={campaign.publicId}
          >
            <div className="flex max-w-3xl flex-col gap-2">
              <span className={eyebrowClass}>{bandLabel(campaign)}</span>
              <h3 className="font-serif text-2xl font-bold leading-tight md:text-[2rem]" id={`campaign-${campaign.publicId}-title`}>
                {campaign.question}
              </h3>
              {campaign.intro && <p className="text-base [color:var(--tone-muted)]">{campaign.intro}</p>}
            </div>
            {(question || bandSessions.length > 0 || table) && (
              <div className={`grid grid-cols-1 gap-4 ${TILE_COLUMNS[[question, bandSessions.length > 0, table].filter(Boolean).length]}`}>
                {question && (
                  <div className={tile}>
                    <strong className="text-base">Answer on your own</strong>
                    <span className="flex-auto text-[0.9375rem] [color:var(--tone-muted)]">{openMeta(question)}</span>
                    <Link className={outlineButton} href={`/listens/${question.publicId}`}>
                      Answer
                    </Link>
                  </div>
                )}
                {bandSessions.length > 0 && (
                  <div className={tile}>
                    <strong className="text-base">Join a session</strong>
                    <ul className="flex flex-auto list-none flex-col gap-3 p-0">
                      {bandSessions.map((item) => (
                        <li className="flex flex-col gap-0.5 text-sm" key={item.publicId}>
                          <span className="text-[0.9375rem] font-semibold">{item.organizerLabel ? `${item.title}, hosted by ${item.organizerLabel}` : item.title}</span>
                          <span className="[color:var(--tone-muted)]">{hubEventMeta(item)}</span>
                          <Link className="self-start font-semibold [color:var(--tone-accent)]" href={`/listens/events/${item.publicId}`}>
                            {item.seatsLeft !== null && item.seatsLeft <= 0 ? 'See the session' : 'Save a seat'}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {table && (
                  <div className={tile} id={`table-${campaign.publicId}`}>
                    <strong className="text-base">Host a table of your own</strong>
                    {block.tableText?.trim() && <p className="text-[0.9375rem] [color:var(--tone-muted)]">{block.tableText.trim()}</p>}
                    <div className={lightFormCard}>
                      <KitchenTable bare campaign={table} />
                    </div>
                    <p className="text-sm [color:var(--tone-muted)]">
                      Hosting more than one table, or want a WUWF journalist to join?{' '}
                      <Link className="font-semibold [color:var(--tone-accent)]" href="/listens/host">
                        Ask to host a session →
                      </Link>
                    </p>
                  </div>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </SectionBand>
  )
}

/** Open questions. Draws nothing without the hub, or with nothing of its kind to show. */
export async function ListeningOpenSection({ block, context }: SectionProps<ListeningOpenData>) {
  // The table form is a client component that sends through a server action to the Portal: loaded when the section draws, not when the registry is read.
  const { KitchenTable } = await import('@/components/Listening/KitchenTable')
  return <ListeningOpenView KitchenTable={KitchenTable} block={block} load={context.listeningHub} />
}
