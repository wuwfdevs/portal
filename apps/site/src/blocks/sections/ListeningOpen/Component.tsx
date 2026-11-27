import Link from 'next/link'
import React from 'react'

import type { KitchenTable as KitchenTableForm } from '@/components/Listening/KitchenTable'
import { hubEventMeta } from '@/lib/listening/event'
import { bandLabel, deskLabel, hubLayout, openMeta } from '@/lib/listening/hub'
import type { HubLoad } from '@/lib/listening/load'

import { SectionBand } from '../SectionBand'
import { eyebrowClass, SectionLink } from '../parts'
import { cardClass, hubProblem, lightFormCard, outlineButton } from '../listening-parts'
import type { SectionData, SectionProps } from '../types'

export interface ListeningOpenData extends SectionData {
  emptyText?: string | null
  tableText?: string | null
  voiceOnlyIntro?: string | null
}

/** A question's ways in sit in one row from a tablet up, one column on a phone: the class is chosen by how many there are. */
const TILE_COLUMNS = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3', 'md:grid-cols-2']
const tile = 'flex flex-col gap-2 rounded-md p-[18px] [background:var(--tone-tint)]'

/** How many reporters' questions the home page shows; the rest are on the hub, one link away. */
export const HOME_QUESTIONS = 3

/**
 * Open questions. A pure view over what the Portal answered, so it is tested with fixtures.
 *
 * On the home page (`home`, the homepage rethink, 2026-11-25) it is the restrained form: the questions as cards (their sessions and tables stay on the hub),
 * at most three cards, "See all of WUWF Listens" in the heading's row, and nothing at all, never a message, when nothing is open or the Portal is not set up or cannot be read,
 * so the page closes up.
 */
export function ListeningOpenView({ block, load, KitchenTable, home = false }: { block: ListeningOpenData; load: HubLoad | undefined; KitchenTable: typeof KitchenTableForm; home?: boolean }) {
  if (!load) return null
  if (home && load.kind !== 'ok') return null
  const reporters = home || block.variant === 'reporters'
  const problem = hubProblem(load)
  if (problem) {
    // One band says it (the bands one), so a page holding both does not say it twice.
    return reporters ? null : (
      <SectionBand block={block} heading={block.heading}>
        <p className="max-w-2xl text-lg [color:var(--tone-muted)]">{problem}</p>
      </SectionBand>
    )
  }
  if (load.kind !== 'ok') return null
  const hub = load.hub
  const { bands, questions, sessions } = hubLayout(hub)

  if (reporters) {
    const shown = home ? questions.slice(0, HOME_QUESTIONS) : questions
    if (shown.length === 0) return null
    const writtenToo = shown.some((item) => item.allowTextAnswers)
    const heading = { ...block.heading, intro: writtenToo ? block.heading?.intro : block.voiceOnlyIntro?.trim() || block.heading?.intro }
    const more = home ? <SectionLink href="/listens" label="See all of WUWF Listens" /> : undefined
    return (
      <SectionBand block={block} heading={heading} more={more}>
        <ul className="grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
          {shown.map((item) => (
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

  const empty = bands.length === 0 && hub.answered.length === 0 && sessions.length === 0
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
        {bands.map(({ question, sessions: bandSessions }) => {
          const ways = [true, bandSessions.length > 0, question.canHostTable, question.canRequestHost].filter(Boolean).length
          return (
            <article
              aria-labelledby={`question-${question.publicId}-title`}
              className="flex flex-col gap-5 rounded-lg border-2 p-5 [background:var(--tone-card)] [border-color:var(--tone-text)] md:p-8"
              id={`question-${question.publicId}`}
              key={question.publicId}
            >
              <div className="flex max-w-3xl flex-col gap-2">
                <span className={eyebrowClass}>{bandLabel(question)}</span>
                <h3 className="font-serif text-2xl font-bold leading-tight md:text-[2rem]" id={`question-${question.publicId}-title`}>
                  {question.title}
                </h3>
                {question.intro && <p className="text-base [color:var(--tone-muted)]">{question.intro}</p>}
              </div>
              <div className={`grid grid-cols-1 gap-4 ${TILE_COLUMNS[ways]}`}>
                <div className={tile}>
                  <strong className="text-base">Answer on your own</strong>
                  <span className="flex-auto text-[0.9375rem] [color:var(--tone-muted)]">{openMeta(question)}</span>
                  <Link className={outlineButton} href={`/listens/${question.publicId}`}>
                    Answer
                  </Link>
                </div>
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
                {question.canHostTable && (
                  <div className={tile} id={`table-${question.publicId}`}>
                    <strong className="text-base">Host a table of your own</strong>
                    {block.tableText?.trim() && <p className="text-[0.9375rem] [color:var(--tone-muted)]">{block.tableText.trim()}</p>}
                    <div className={lightFormCard}>
                      <KitchenTable bare query={{ publicId: question.publicId, title: question.title }} />
                    </div>
                  </div>
                )}
                {question.canRequestHost && (
                  <div className={tile}>
                    <strong className="text-base">Bring a session to your table</strong>
                    <p className="flex-auto text-[0.9375rem] [color:var(--tone-muted)]">
                      Invite a few people, or open it to anyone, and ask for a WUWF journalist to join. Someone at WUWF will write back within a week.
                    </p>
                    <Link className={outlineButton} href={`/listens/host?query=${question.publicId}`}>
                      Ask to host one
                    </Link>
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </SectionBand>
  )
}

/** Open questions. Draws nothing without the hub, or with nothing of its kind to show. */
export async function ListeningOpenSection({ block, context }: SectionProps<ListeningOpenData>) {
  // The table form is a client component that sends through a server action to the Portal: loaded when the section draws, not when the registry is read.
  const { KitchenTable } = await import('@/components/Listening/KitchenTable')
  return <ListeningOpenView KitchenTable={KitchenTable} block={block} home={context.setId === 'home'} load={context.listeningHub} />
}
