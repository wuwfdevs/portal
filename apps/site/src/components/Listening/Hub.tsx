import Link from 'next/link'
import React from 'react'

import type { ListeningHub } from '@wuwf/portal-contracts'

import { hubEventMeta } from '@/lib/listening/event'
import {
  answeredBy,
  bandLabel,
  deskLabel,
  hubLayout,
  openMeta,
  outcomeDate,
  outcomeKicker,
} from '@/lib/listening/hub'

import { AskWuwf } from './AskWuwf'
import { KitchenTable } from './KitchenTable'
import { eyebrow } from './styles'

/** A campaign's ways in sit in one row from a tablet up, one column on a phone: the class is chosen by how many there are. */
const TILE_COLUMNS = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3']

const answerLink =
  'inline-flex min-h-11 items-center justify-center self-start rounded-sm border border-ink px-4 text-[0.9375rem] font-bold text-ink hover:bg-surface-2 hover:no-underline'

/**
 * WUWF Listens, the hub (board 5), as far as it can be built over what the Portal serves today: the hero, one band for each open
 * campaign ("What we're listening for right now": its question, then answer alone, join a session, host a table), the questions
 * a reporter has open on their own ("A reporter would like to hear from you"), and what came of the questions already answered
 * ("You asked. Here's what came of it."). An open question shows no count; a count appears only beside an outcome.
 *
 * Ask WUWF and "Host a session" (suite phase C) stand behind real inboxes in the Portal. Upcoming listed public sessions (phase E)
 * come from the Portal's hub, each linking to its own page and seat form. The season reports (phase F) are not here yet, and are left
 * out rather than drawn as if they worked.
 */
export const HubView: React.FC<{ hub: ListeningHub }> = ({ hub }) => {
  const { bands, questions, sessions, tables: kitchen } = hubLayout(hub)
  const empty =
    bands.length === 0 &&
    questions.length === 0 &&
    hub.answered.length === 0 &&
    sessions.length === 0 &&
    kitchen.length === 0
  const hasOpen = hub.open.length > 0
  const firstTable = bands.find((band) => band.table)
  const tableHref = firstTable ? `#table-${firstTable.campaign.publicId}` : '#kitchen-table'
  return (
    <>
      <section className="bg-wuwf-blue-100">
        <div className="container flex flex-wrap items-start gap-x-14 gap-y-10 py-12 md:py-14">
          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
            <span className={`${eyebrow} inline-flex items-center gap-2`}>
              <svg
                aria-hidden="true"
                fill="none"
                height="18"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="18"
              >
                <rect height="11" rx="3" width="6" x="9" y="3" />
                <path d="M5 11a7 7 0 0014 0M12 18v3" />
              </svg>
              WUWF Listens
            </span>
            <h1 className="max-w-3xl font-serif text-4xl font-bold leading-[1.04] tracking-tight md:text-6xl">
              Your questions shape our reporting.
            </h1>
            <p className="max-w-3xl font-serif text-xl leading-snug text-ink-2">
              Ask us something. Suggest a story. Answer a reporter. Sit down with your neighbors. A
              person at WUWF reads every word. Your answers go to WUWF for editorial review and are
              never published automatically.
            </p>
            <ul className="mt-2 flex flex-col gap-1.5 text-base font-semibold">
              {hasOpen && (
                <li>
                  <a
                    className="text-wuwf-blue-700"
                    href={bands.length > 0 ? '#now' : '#help-us-report'}
                  >
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
              {(kitchen.length > 0 || firstTable) && (
                <li>
                  <a className="text-wuwf-blue-700" href={tableHref}>
                    Host a table of your own →
                  </a>
                </li>
              )}
              <li>
                <Link className="text-wuwf-blue-700" href="/listens/host">
                  Host a listening session →
                </Link>
              </li>
            </ul>
          </div>
          <div className="min-w-0 flex-[1_1_520px] md:max-w-[640px]">
            <AskWuwf />
          </div>
        </div>
      </section>

      {empty && (
        <section className="container py-14">
          <p className="max-w-2xl text-lg text-ink-2">
            No reporter has a question open right now. Check back soon.
          </p>
        </section>
      )}

      {bands.length > 0 && (
        <section
          aria-labelledby="now-title"
          className="container flex flex-col gap-6 py-12"
          id="now"
        >
          <div className="flex max-w-3xl flex-col gap-2">
            <h2 className="font-serif text-3xl font-bold" id="now-title">
              What we&apos;re listening for right now
            </h2>
            <p className="text-base text-ink-2">
              Each question is open for a while, and there is more than one way to answer it. A
              person at WUWF reads every answer.
            </p>
          </div>
          {bands.map(({ campaign, question, sessions: bandSessions, table }) => (
            <article
              aria-labelledby={`campaign-${campaign.publicId}-title`}
              className="flex flex-col gap-5 rounded-lg border-2 border-ink bg-surface p-5 md:p-8"
              id={`campaign-${campaign.publicId}`}
              key={campaign.publicId}
            >
              <div className="flex max-w-3xl flex-col gap-2">
                <span className={eyebrow}>{bandLabel(campaign)}</span>
                <h3
                  className="font-serif text-2xl font-bold leading-tight md:text-[2rem]"
                  id={`campaign-${campaign.publicId}-title`}
                >
                  {campaign.question}
                </h3>
                {campaign.intro && <p className="text-base text-ink-2">{campaign.intro}</p>}
              </div>
              {(question || bandSessions.length > 0 || table) && (
                <div
                  className={`grid grid-cols-1 gap-4 ${TILE_COLUMNS[[question, bandSessions.length > 0, table].filter(Boolean).length]}`}
                >
                  {question && (
                    <div className="flex flex-col gap-2 rounded-md bg-surface-2 p-[18px]">
                      <strong className="text-base">Answer on your own</strong>
                      <span className="flex-auto text-[0.9375rem] text-ink-2">
                        {openMeta(question)}
                      </span>
                      <Link className={answerLink} href={`/listens/${question.publicId}`}>
                        Answer
                      </Link>
                    </div>
                  )}
                  {bandSessions.length > 0 && (
                    <div className="flex flex-col gap-2 rounded-md bg-surface-2 p-[18px]">
                      <strong className="text-base">Join a session</strong>
                      <ul className="flex flex-auto flex-col gap-3">
                        {bandSessions.map((item) => (
                          <li className="flex flex-col gap-0.5 text-sm" key={item.publicId}>
                            <span className="text-[0.9375rem] font-semibold">
                              {item.organizerLabel
                                ? `${item.title}, hosted by ${item.organizerLabel}`
                                : item.title}
                            </span>
                            <span className="text-ink-3">{hubEventMeta(item)}</span>
                            <Link
                              className="self-start font-semibold text-wuwf-blue-700"
                              href={`/listens/events/${item.publicId}`}
                            >
                              {item.seatsLeft !== null && item.seatsLeft <= 0
                                ? 'See the session'
                                : 'Save a seat'}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {table && (
                    <div
                      className="flex flex-col gap-3 rounded-md bg-wuwf-lime-100 p-[18px]"
                      id={`table-${campaign.publicId}`}
                    >
                      <strong className="text-base">Host a table of your own</strong>
                      <p className="text-[0.9375rem] text-ink-2">
                        Gather a few people in your kitchen, a break room or a church hall. Your
                        phone reads the question, records the conversation once everyone agrees, and
                        sends it to WUWF. Nothing is public.
                      </p>
                      <KitchenTable bare campaign={table} />
                      <p className="text-sm text-ink-2">
                        Hosting more than one table, or want a WUWF journalist to join?{' '}
                        <Link className="font-semibold text-wuwf-blue-700" href="/listens/host">
                          Ask to host a session →
                        </Link>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {questions.length > 0 && (
        <section
          aria-labelledby="help-us-report-title"
          className="container py-12"
          id="help-us-report"
        >
          <h2 className="font-serif text-3xl font-bold" id="help-us-report-title">
            A reporter would like to hear from you
          </h2>
          <p className="mb-5 mt-2 max-w-2xl text-base text-ink-2">
            One reporter, one story, a few minutes{' '}
            {questions.some((item) => item.allowTextAnswers)
              ? 'by voice or in writing'
              : 'by voice'}
            .
          </p>
          <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
            {questions.map((item) => (
              <li
                className="flex flex-col gap-2.5 rounded-lg border border-rule-strong bg-surface p-5"
                key={item.publicId}
              >
                {deskLabel(item) && <span className={eyebrow}>{deskLabel(item)}</span>}
                <span className="flex-auto font-serif text-[1.3125rem] font-semibold leading-snug">
                  {item.title}
                </span>
                <span className="text-sm text-ink-3">{openMeta(item)}</span>
                <Link className={answerLink} href={`/listens/${item.publicId}`}>
                  Answer
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sessions.length > 0 && (
        <section
          aria-labelledby="join-session-title"
          className="container py-12"
          id="join-a-session"
        >
          <h2 className="font-serif text-3xl font-bold" id="join-session-title">
            Join a listening session
          </h2>
          <p className="mb-5 mt-2 max-w-2xl text-base text-ink-2">
            Sit down with your neighbors at a table, talk about a question that matters here, and a
            WUWF journalist listens to what was said.
          </p>
          <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
            {sessions.map((item) => (
              <li
                className="flex flex-col gap-2.5 rounded-lg border border-rule-strong bg-surface p-5"
                key={item.publicId}
              >
                {item.organizerLabel && (
                  <span className={eyebrow}>Hosted by {item.organizerLabel}</span>
                )}
                <span className="flex-auto font-serif text-[1.3125rem] font-semibold leading-snug">
                  {item.title}
                </span>
                <span className="text-sm text-ink-3">{hubEventMeta(item)}</span>
                <Link className={answerLink} href={`/listens/events/${item.publicId}`}>
                  {item.seatsLeft !== null && item.seatsLeft <= 0
                    ? 'See the session'
                    : 'Save a seat'}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {kitchen.length > 0 && (
        <section aria-labelledby="kitchen-title" className="container py-12" id="kitchen-table">
          <h2 className="font-serif text-3xl font-bold" id="kitchen-title">
            Host a table of your own
          </h2>
          <p className="mb-6 mt-2 max-w-2xl text-base text-ink-2">
            Gather a few people in your kitchen, a break room or a church hall. Your phone reads the
            question, records the conversation once everyone agrees, and sends it to WUWF. Nothing
            is public.
          </p>
          <div className="flex flex-col gap-10">
            {kitchen.map((campaign) => (
              <KitchenTable campaign={campaign} key={campaign.publicId} />
            ))}
          </div>
        </section>
      )}

      {hub.answered.length > 0 && (
        <section
          aria-labelledby="came-of-it-title"
          className="bg-surface-dark text-surface"
          id="came-of-it"
        >
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
                      <span className="font-serif text-xl italic leading-snug text-surface-dark-text">
                        “{item.title}”
                      </span>
                      {who && (
                        <span className="text-[0.8125rem] text-surface-dark-text">{who}</span>
                      )}
                      <span className="flex flex-col gap-1 border-t border-surface-dark-line pt-3.5">
                        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-wuwf-lime">
                          {outcomeKicker(outcome, item.contextLabel)}
                        </span>
                        <strong className="text-[1.1875rem] leading-snug">{outcome.title}</strong>
                      </span>
                      {(outcome.summary || date) && (
                        <span className="text-sm text-surface-dark-text">
                          {outcome.summary ?? date}
                        </span>
                      )}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}

      <section aria-labelledby="host-title" className="bg-wuwf-blue-100">
        <div className="container flex flex-col items-start gap-3 py-12">
          <span className={eyebrow}>Host a session</span>
          <h2 className="font-serif text-3xl font-bold" id="host-title">
            Bring a listening session to your table.
          </h2>
          <p className="max-w-2xl text-base text-ink-2">
            Invite a few people to talk about something that matters where you live, or open it to
            anyone. You can ask for a WUWF journalist to join. Someone at WUWF will write back
            within a week.
          </p>
          <Link className={answerLink} href="/listens/host">
            Ask to host one
          </Link>
        </div>
      </section>
    </>
  )
}
