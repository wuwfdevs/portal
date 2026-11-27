import Link from 'next/link'
import React from 'react'

import { bandLabel, deskLabel, hubLayout, openMeta } from '@/lib/listening/hub'
import { sessionsLine, talkPath } from '@/lib/listening/talk'
import type { HubLoad } from '@/lib/listening/load'

import { SectionBand } from '../SectionBand'
import { eyebrowClass, SectionLink } from '../parts'
import { cardClass, hubProblem, outlineButton } from '../listening-parts'
import { buttonClasses } from '@/components/Kit/button'
import type { SectionData, SectionProps } from '../types'

export interface ListeningOpenData extends SectionData {
  emptyText?: string | null
  voiceOnlyIntro?: string | null
}


/** How many reporters' questions the home page shows; the rest are on the hub, one link away. */
export const HOME_QUESTIONS = 3

/**
 * Open questions. A pure view over what the Portal answered, so it is tested with fixtures.
 *
 * On the home page (`home`, the homepage rethink, 2026-11-25) it is the restrained form: the questions as cards (their sessions and tables stay on the hub),
 * at most three cards, "See all of WUWF Listens" in the heading's row, and nothing at all, never a message, when nothing is open or the Portal is not set up or cannot be read,
 * so the page closes up.
 */
export function ListeningOpenView({ block, load, home = false }: { block: ListeningOpenData; load: HubLoad | undefined; home?: boolean }) {
  if (!load) return null
  if (home && load.kind !== 'ok') return null
  const reporters = home || block.variant === 'reporters'
  const problem = hubProblem(load)
  if (problem) {
    // One layout says it (the sessions one), so a page holding both does not say it twice.
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
  // One card for each open question, with one action: answering. What else the question offers (sessions to join, a way to gather people) is on its own page,
  // and the card says only whether a session is coming up.
  return (
    <SectionBand block={block} heading={block.heading}>
      <ul className="grid list-none gap-5 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        {bands.map(({ question, sessions: questionSessions }) => (
          <li className={`flex flex-col gap-3.5 p-6 ${cardClass}`} id={`question-${question.publicId}`} key={question.publicId}>
            {bandLabel(question) && <span className={eyebrowClass}>{bandLabel(question)}</span>}
            <span className="flex-auto font-serif text-2xl font-semibold leading-snug">{question.title}</span>
            <span className="text-sm [color:var(--tone-muted)]">{openMeta(question)}</span>
            <Link className={buttonClasses({ variant: 'tone', className: 'self-start' })} href={`/listens/${question.publicId}`}>
              Answer
            </Link>
            <p className="border-t pt-3 text-sm [border-color:var(--tone-card-rule)] [color:var(--tone-muted)]">
              {questionSessions.length > 0 ? (
                <Link className="font-semibold [color:var(--tone-accent)]" href={talkPath(question.publicId)}>
                  {sessionsLine(questionSessions.length)}
                </Link>
              ) : (
                sessionsLine(0)
              )}
            </p>
          </li>
        ))}
      </ul>
    </SectionBand>
  )
}

/** Open questions. Draws nothing without the hub, or with nothing of its kind to show. */
export async function ListeningOpenSection({ block, context }: SectionProps<ListeningOpenData>) {
  return <ListeningOpenView block={block} home={context.setId === 'home'} load={context.listeningHub} />
}
