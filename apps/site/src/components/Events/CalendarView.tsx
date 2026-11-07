import Link from 'next/link'
import React from 'react'

import { Chip } from '@/components/Article/Parts'
import { ChipLink } from '@/components/Events/ChipLink'
import { calendarHref, type CalendarQuery, type CalendarResult } from '@/lib/events/calendar'
import { stationToday, timeRange } from '@/lib/events/schedule'
import type { EventCategory } from '@/payload-types'

import { dayHeading, where } from './format'

const field = 'min-h-11 w-full min-w-0 max-w-full rounded-sm border border-rule-strong bg-surface px-3 text-base text-ink'
const pill = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border px-4 text-base font-semibold'

/**
 * The community calendar (the station's listing of events in the region). With no dates picked it is "what's coming up",
 * each event once at its next date; with dates it is "what's on", day by day. The filter is a plain form that reads the
 * address, so it works without a script and every filtered view can be linked to.
 */
export function CalendarView({ query, result, categories, now }: { query: CalendarQuery; result: CalendarResult; categories: EventCategory[]; now: Date }) {
  const today = stationToday(now)
  const filtering = query.categories.length > 0 || query.from || query.to || query.q
  return (
    <div className="pb-20">
      <header className="container flex max-w-[60rem] flex-col gap-3 pt-8 md:pt-12">
        <div>
          <Chip tone="teal">Community calendar</Chip>
        </div>
        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-ink md:text-5xl">Events in our community</h1>
        <p className="max-w-[44rem] font-serif text-xl text-ink-2">
          Concerts, meetings, fundraisers and more, from non-profit organizations, schools and government across the Gulf Coast. Listings are sent in by the community and reviewed by WUWF.
        </p>
        <p>
          <Link className="inline-flex min-h-11 items-center rounded-sm bg-wuwf-blue-700 px-5 text-base font-bold text-surface hover:bg-wuwf-blue-600 hover:no-underline" href="/community-calendar-event-submission">
            Submit an event
          </Link>
        </p>
      </header>

      <div className="container mt-10 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <form action="/community-calendar" aria-label="Filter events" className="flex flex-col gap-5 self-start rounded-sm border border-rule p-4" method="get">
          <div className="flex flex-col gap-1">
            <label className="text-base font-semibold text-ink" htmlFor="cal-q">
              Search
            </label>
            <input autoComplete="off" className={field} defaultValue={query.q} id="cal-q" maxLength={80} name="q" type="search" />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-base font-semibold text-ink" htmlFor="cal-from">
                From
              </label>
              <input className={field} defaultValue={query.from ?? ''} id="cal-from" name="from" type="date" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label className="text-base font-semibold text-ink" htmlFor="cal-to">
                To
              </label>
              <input className={field} defaultValue={query.to ?? ''} id="cal-to" name="to" type="date" />
            </div>
          </div>
          <fieldset className="flex flex-col">
            <legend className="mb-1 text-base font-semibold text-ink">Categories</legend>
            {categories.map((c) => (
              <label className="flex min-h-11 items-center gap-3 text-base text-ink" key={c.id}>
                <input className="size-5" defaultChecked={query.categories.includes(c.slug)} name="category" type="checkbox" value={c.slug} />
                <span>
                  {c.title} <span className="text-ink-3">({result.categoryCounts[c.slug] ?? 0})</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <button className="inline-flex min-h-11 items-center justify-center rounded-sm bg-wuwf-blue-700 px-5 text-base font-bold text-surface hover:bg-wuwf-blue-600" type="submit">
              Show events
            </button>
            {filtering && (
              <Link className="inline-flex min-h-11 items-center font-semibold text-wuwf-blue-700 underline" href="/community-calendar">
                Clear filters
              </Link>
            )}
          </div>
        </form>

        <section aria-label="Events" className="min-w-0">
          <p aria-live="polite" className="mb-6 text-sm text-ink-3">
            {result.total === 0
              ? 'No events match.'
              : `${result.total} ${result.total === 1 ? 'event' : 'events'}${result.expanded ? ` from ${dayHeading(result.window.from, today)} to ${dayHeading(result.window.to, today)}` : ' coming up'}${result.totalPages > 1 ? ` · page ${result.page} of ${result.totalPages}` : ''}`}
          </p>
          {result.total === 0 ? (
            <p className="text-base text-ink-2">
              {filtering ? (
                <>
                  Nothing matches those filters. <Link className="font-semibold text-wuwf-blue-700 underline" href="/community-calendar">See everything coming up</Link>.
                </>
              ) : (
                <>
                  Nothing is listed yet. <Link className="font-semibold text-wuwf-blue-700 underline" href="/community-calendar-event-submission">Be the first to submit an event</Link>.
                </>
              )}
            </p>
          ) : (
            <div className="flex flex-col gap-10">
              {result.days.map((day) => (
                <section aria-labelledby={`day-${day.date}`} key={day.date}>
                  <h2 className="border-b border-rule pb-2 font-serif text-2xl font-bold text-ink" id={`day-${day.date}`}>
                    {dayHeading(day.date, today)}
                    {day.date === today && <span className="ml-3 align-middle font-sans text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">Today</span>}
                  </h2>
                  <ul className="mt-4 flex flex-col gap-6">
                    {day.entries.map((e) => (
                      <li className="flex flex-col gap-2" key={`${e.event.id}-${e.date}-${e.start}`}>
                        <p className="text-sm font-bold uppercase tracking-wide text-wuwf-blue-700">{timeRange(e.start, e.end)}</p>
                        <h3 className="font-serif text-xl font-bold leading-snug text-ink">
                          <Link className="inline-flex min-h-11 items-center text-ink hover:text-wuwf-blue-700" href={e.event.path}>
                            {e.event.title}
                          </Link>
                        </h3>
                        <p className="text-base text-ink-2">
                          {[where(e.event.venueName, e.event.city), e.event.free ? 'Free' : e.event.price].filter(Boolean).join(' · ')}
                        </p>
                        {e.event.teaser && <p className="max-w-[44rem] text-base text-ink-2">{e.event.teaser}</p>}
                        {e.repeats && (
                          <p className="text-sm text-ink-3">
                            {e.repeats}
                            {e.more > 0 && ` · ${e.more} more ${e.more === 1 ? 'date' : 'dates'}`}
                          </p>
                        )}
                        {e.event.categories.length > 0 && (
                          <ul aria-label="Categories" className="flex flex-wrap gap-2">
                            {e.event.categories.map((c) => (
                              <li key={c.slug}>
                                <ChipLink href={calendarHref({ categories: [c.slug] })}>{c.title}</ChipLink>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          <Pagination page={result.page} query={query} totalPages={result.totalPages} />
        </section>
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, query }: { page: number; totalPages: number; query: CalendarQuery }) {
  if (totalPages <= 1) return null
  const wanted = new Set([1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages))
  const numbers = [...wanted].sort((a, b) => a - b)
  const href = (n: number) => calendarHref(query, n)
  return (
    <nav aria-label="Pagination" className="mt-12 flex flex-wrap items-center gap-2 font-sans">
      {page > 1 && (
        <Link className={`${pill} border-rule-strong text-wuwf-blue-700 hover:bg-surface-2 hover:no-underline`} href={href(page - 1)} rel="prev">
          Earlier
        </Link>
      )}
      {numbers.map((n, i) => (
        <React.Fragment key={n}>
          {i > 0 && n - numbers[i - 1]! > 1 && <span aria-hidden="true" className="px-1 text-ink-3">…</span>}
          {n === page ? (
            <span aria-current="page" className={`${pill} border-wuwf-blue-700 bg-wuwf-blue-700 text-surface`}>
              {n}
            </span>
          ) : (
            <Link aria-label={`Page ${n}`} className={`${pill} border-rule-strong text-wuwf-blue-700 hover:bg-surface-2 hover:no-underline`} href={href(n)}>
              {n}
            </Link>
          )}
        </React.Fragment>
      ))}
      {page < totalPages && (
        <Link className={`${pill} border-rule-strong text-wuwf-blue-700 hover:bg-surface-2 hover:no-underline`} href={href(page + 1)} rel="next">
          Later
        </Link>
      )}
    </nav>
  )
}
