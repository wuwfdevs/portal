import Link from 'next/link'
import React from 'react'

import type { ListeningHubEvent } from '@wuwf/portal-contracts'

import { buttonClasses } from '@/components/Kit/button'
import { eventIsFull, hubEventMeta } from '@/lib/listening/event'
import { gatherHint, gatherPath, TALK_ANCHOR, TALK_INTRO, type GatherOptions } from '@/lib/listening/talk'
import { cn } from '@/utilities/ui'

/**
 * "Talk it over with others": the part of a question's page that follows answering. The sessions to join, then one way to gather people
 * yourself (one button, because the page it opens asks which way). It has no state, so it draws on the server (the question's page) and
 * inside the question card's finished screen alike. `band` is the page's own section; `card` sits inside the card after an answer.
 */
export const TalkItOver: React.FC<{ publicId: string; sessions: ListeningHubEvent[]; options: GatherOptions; variant?: 'band' | 'card' }> = ({
  publicId,
  sessions,
  options,
  variant = 'band',
}) => {
  const hint = gatherHint(options)
  const band = variant === 'band'
  return (
    <section aria-labelledby={`${TALK_ANCHOR}-${variant}`} className="flex flex-col gap-4 text-left" id={band ? TALK_ANCHOR : undefined}>
      <div className="flex flex-col gap-1.5">
        <h2 className={cn('font-serif font-semibold text-ink', band ? 'text-2xl' : 'text-xl')} id={`${TALK_ANCHOR}-${variant}`}>
          Talk it over with others
        </h2>
        <p className="text-[0.9375rem] leading-relaxed text-ink-2">{TALK_INTRO}</p>
      </div>

      {sessions.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {sessions.map((session) => (
            <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-rule bg-surface px-4 py-3" key={session.publicId}>
              <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
                <span className="font-serif text-lg font-semibold leading-snug text-ink">
                  {session.organizerLabel ? `${session.title}, hosted by ${session.organizerLabel}` : session.title}
                </span>
                <span className="text-sm text-ink-3">{hubEventMeta(session)}</span>
              </div>
              <Link className={buttonClasses({ variant: 'outline' })} href={`/listens/events/${session.publicId}`}>
                {eventIsFull(session) ? 'See the session' : 'Save a seat'}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {hint && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link className={buttonClasses({ variant: 'action' })} href={gatherPath(publicId)}>
            Gather people
          </Link>
          <span className="text-sm text-ink-3">{hint}</span>
        </div>
      )}
    </section>
  )
}
