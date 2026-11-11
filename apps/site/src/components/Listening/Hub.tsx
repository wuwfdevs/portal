import Link from 'next/link'
import React from 'react'

import type { ListeningHub } from '@wuwf/portal-contracts'

import { answeredBy, deskLabel, openMeta, outcomeDate, outcomeKicker } from '@/lib/listening/hub'

import { AskWuwf } from './AskWuwf'
import { eyebrow } from './styles'

const answerLink =
  'inline-flex min-h-11 items-center justify-center self-start rounded-sm border border-ink px-4 text-[0.9375rem] font-bold text-ink hover:bg-surface-2 hover:no-underline'

/**
 * WUWF Listens, the hub (board 5), as far as it can be built over what the Portal serves today: the hero, the questions a
 * reporter has open ("A reporter would like to hear from you"), and what came of the questions already answered ("You asked.
 * Here's what came of it."). An open question shows no count; a count appears only beside an outcome.
 *
 * Ask WUWF and "Host a session" (suite phase C) stand behind real inboxes in the Portal. Not here yet, because nothing stands behind
 * them: the regional conversations and sessions people can attend, and the season reports. They arrive with phases D to F of the suite
 * design and are left out rather than drawn as if they worked.
 */
export const HubView: React.FC<{ hub: ListeningHub }> = ({ hub }) => {
  const empty = hub.open.length === 0 && hub.answered.length === 0
  return (
    <>
      <section className="bg-wuwf-blue-100">
        <div className="container flex flex-col gap-4 py-12 md:py-14">
          <span className={`${eyebrow} inline-flex items-center gap-2`}>
            <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
              <rect height="11" rx="3" width="6" x="9" y="3" />
              <path d="M5 11a7 7 0 0014 0M12 18v3" />
            </svg>
            WUWF Listens
          </span>
          <h1 className="max-w-3xl font-serif text-4xl font-bold leading-[1.04] tracking-tight md:text-6xl">Your questions shape our reporting.</h1>
          <p className="max-w-3xl font-serif text-xl leading-snug text-ink-2">
            Answer a reporter. A person at WUWF reads every word. Your answers go to WUWF for editorial review and are never published automatically.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-base font-semibold">
            {hub.open.length > 0 && (
              <li>
                <a className="text-wuwf-blue-700" href="#help-us-report">
                  Answer a question →
                </a>
              </li>
            )}
            {hub.answered.length > 0 && (
              <li>
                <a className="text-wuwf-blue-700" href="#came-of-it">
                  See what came of other people&apos;s answers →
                </a>
              </li>
            )}
            <li>
              <a className="text-wuwf-blue-700" href="#ask">
                Ask WUWF something →
              </a>
            </li>
            <li>
              <Link className="text-wuwf-blue-700" href="/listens/host">
                Host a listening session →
              </Link>
            </li>
          </ul>
        </div>
      </section>

      {empty && (
        <section className="container py-14">
          <p className="max-w-2xl text-lg text-ink-2">No reporter has a question open right now. Check back soon.</p>
        </section>
      )}

      {hub.open.length > 0 && (
        <section aria-labelledby="help-us-report-title" className="container py-12" id="help-us-report">
          <h2 className="font-serif text-3xl font-bold" id="help-us-report-title">
            A reporter would like to hear from you
          </h2>
          <p className="mb-5 mt-2 max-w-2xl text-base text-ink-2">
            One reporter, one story, a few minutes {hub.open.some((item) => item.allowTextAnswers) ? 'by voice or in writing' : 'by voice'}.
          </p>
          <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
            {hub.open.map((item) => (
              <li className="flex flex-col gap-2.5 rounded-lg border border-rule-strong bg-surface p-5" key={item.publicId}>
                {deskLabel(item) && <span className={eyebrow}>{deskLabel(item)}</span>}
                <span className="flex-auto font-serif text-[1.3125rem] font-semibold leading-snug">{item.title}</span>
                <span className="text-sm text-ink-3">{openMeta(item)}</span>
                <Link className={answerLink} href={`/listens/${item.publicId}`}>
                  Answer
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hub.answered.length > 0 && (
        <section aria-labelledby="came-of-it-title" className="bg-surface-dark text-surface" id="came-of-it">
          <div className="container flex flex-col gap-6 py-14">
            <h2 className="font-serif text-3xl font-bold md:text-4xl" id="came-of-it-title">
              You asked. Here&apos;s what came of it.
            </h2>
            <ul className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
              {hub.answered.map((item) => {
                const outcome = item.outcomes[0]
                if (!outcome) return null
                const who = answeredBy(item.responseCount)
                const date = outcomeDate(outcome.publishedAt)
                return (
                  <li key={item.publicId}>
                    <a
                      className="flex h-full flex-col gap-3.5 rounded-lg border border-surface-dark-line bg-surface-dark-hover p-6 text-surface hover:no-underline"
                      href={outcome.url}
                      rel="noopener"
                    >
                      <span className="font-serif text-xl italic leading-snug text-surface-dark-text">“{item.title}”</span>
                      {who && <span className="text-[0.8125rem] text-surface-dark-text">{who}</span>}
                      <span className="flex flex-col gap-1 border-t border-surface-dark-line pt-3.5">
                        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-wuwf-lime">{outcomeKicker(outcome, item.contextLabel)}</span>
                        <strong className="text-[1.1875rem] leading-snug">{outcome.title}</strong>
                      </span>
                      {(outcome.summary || date) && <span className="text-sm text-surface-dark-text">{outcome.summary ?? date}</span>}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}

      <AskWuwf />

      <section aria-labelledby="host-title" className="bg-wuwf-blue-100">
        <div className="container flex flex-col items-start gap-3 py-12">
          <span className={eyebrow}>Host a session</span>
          <h2 className="font-serif text-3xl font-bold" id="host-title">
            Bring a listening session to your table.
          </h2>
          <p className="max-w-2xl text-base text-ink-2">
            Invite a few people to talk about something that matters where you live, or open it to anyone. You can ask for a WUWF journalist to join. Someone at WUWF will write back within a week.
          </p>
          <Link className={answerLink} href="/listens/host">
            Ask to host one
          </Link>
        </div>
      </section>
    </>
  )
}
