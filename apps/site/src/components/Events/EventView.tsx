import Link from 'next/link'
import React from 'react'

import { ChipLink } from '@/components/Events/ChipLink'
import { Media } from '@/components/Media'
import RichText from '@/components/RichText'
import { calendarHref } from '@/lib/events/calendar'
import { describeSchedule, stationToday, timeRange } from '@/lib/events/schedule'
import { eventJsonLd } from '@/lib/events/structured'
import type { EventPageData } from '@/lib/events/load'
import { jsonLdText } from '@/lib/live/jsonld'
import { getServerSideURL } from '@/utilities/getURL'

import { dayHeading } from './format'

const link = 'font-semibold text-wuwf-blue-700 underline'
const label = 'text-xs font-bold uppercase tracking-widest text-ink-3'

/** An address a visitor can follow, shown without its scheme: "pensacolasymphony.com/tickets". */
const shown = (url: string): string => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')

/**
 * One community-calendar event. It shows what the listing says and nothing the submitter was asked in private. A migrated
 * event whose dates were read from Grove's text shows Grove's own wording; one whose dates could not be read says so.
 * External addresses open as ordinary links (marked as user-supplied), never embedded.
 */
export function EventView({ data }: { data: EventPageData }) {
  const { event, categories, image, schedule, upcoming, past } = data
  const today = stationToday(new Date())
  const venue = event.venue ?? {}
  const org = event.organization ?? {}
  const wording = event.schedule?.displayText?.trim() || null
  const sentence = wording ?? describeSchedule(schedule)
  const address = [venue.street, [venue.city, venue.state].filter(Boolean).join(', '), venue.zip].filter(Boolean).join(' · ') || null
  const recurring = schedule.kind !== 'once' && schedule.kind !== 'listed'
  const next = upcoming[0] ?? null
  const ld = eventJsonLd({
    url: `${getServerSideURL()}${event.path ?? ''}`,
    title: event.title,
    description: event.teaser ?? null,
    occurrence: next,
    venue: { name: venue.name ?? null, street: venue.street ?? null, city: venue.city ?? null, state: venue.state ?? null, zip: venue.zip ?? null },
    organizer: { name: org.name ?? null, website: org.website ?? null },
    free: Boolean(event.free),
    ticketUrl: event.ticketUrl ?? null,
    image: null,
  })

  return (
    <article className="pb-20">
      {ld && <script type="application/ld+json">{jsonLdText(ld)}</script>}
      <header className="container flex max-w-[60rem] flex-col gap-4 pt-8 md:pt-12">
        <div className="flex flex-wrap items-center gap-2">
          <ChipLink href="/community-calendar" tone="teal">
            Community calendar
          </ChipLink>
          {categories.map((c) => (
            <ChipLink href={calendarHref({ categories: [c.slug] })} key={c.id}>
              {c.title}
            </ChipLink>
          ))}
        </div>
        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-ink md:text-5xl">{event.title}</h1>
        {past && (
          <p className="rounded-sm bg-surface-3 p-3 text-base font-semibold text-ink-2" role="note">
            This event has already taken place.
          </p>
        )}
      </header>

      <div className="container mt-8 grid max-w-[60rem] gap-10 md:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          {image && (
            <div className="overflow-hidden rounded-sm">
              <Media imgClassName="w-full object-cover" priority resource={image} />
            </div>
          )}
          {event.description ? (
            <RichText className="mx-0 w-full" data={event.description as never} enableGutter={false} />
          ) : event.teaser ? (
            <p className="text-lg text-ink-2">{event.teaser}</p>
          ) : null}
          {event.artist?.name && (
            <p className="text-base text-ink-2">
              <span className="font-semibold text-ink">Artist: </span>
              {event.artist.website ? (
                <a className={link} href={event.artist.website} rel="noopener noreferrer nofollow ugc">
                  {event.artist.name}
                </a>
              ) : (
                event.artist.name
              )}
            </p>
          )}
          <p className="text-sm text-ink-3">
            Listings come from the community and are reviewed by WUWF. Check with the organizer before you go. To list an event, <Link className={link} href="/community-calendar-event-submission">send it to us</Link>.
          </p>
        </div>

        <aside aria-label="Event details" className="flex flex-col gap-6 self-start rounded-sm border border-rule p-5">
          <section>
            <h2 className={label}>When</h2>
            {sentence ? (
              <p className="mt-1 whitespace-pre-line text-base font-semibold text-ink">{sentence}</p>
            ) : (
              <p className="mt-1 text-base text-ink-2">The date for this event was not listed. Check with the organizer.</p>
            )}
            {event.schedule?.startEstimated && <p className="mt-1 text-sm text-ink-3">The first date was not given in the original listing.</p>}
            {recurring && upcoming.length > 0 && (
              <details className="mt-3">
                <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-wuwf-blue-700">Upcoming dates ({upcoming.length}{upcoming.length === 12 ? '+' : ''})</summary>
                <ul className="mt-1 flex flex-col gap-1 text-base text-ink-2">
                  {upcoming.map((o) => (
                    <li key={`${o.date}-${o.start}`}>
                      {dayHeading(o.date, today)}, {timeRange(o.start, o.end)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section>
            <h2 className={label}>Where</h2>
            {venue.name || address ? (
              <p className="mt-1 text-base text-ink">
                {venue.name && <span className="block font-semibold">{venue.name}</span>}
                {address && <span className="block text-ink-2">{address}</span>}
                {venue.website && (
                  <a className={`${link} block pt-1`} href={venue.website} rel="noopener noreferrer nofollow ugc">
                    {shown(venue.website)}
                  </a>
                )}
              </p>
            ) : (
              <p className="mt-1 text-base text-ink-2">No place was listed.</p>
            )}
          </section>

          {(event.free || event.price || event.priceNotes || event.ticketUrl) && (
            <section>
              <h2 className={label}>Cost</h2>
              <p className="mt-1 text-base font-semibold text-ink">{event.free ? 'Free' : (event.price ?? '')}</p>
              {event.priceNotes && <p className="text-base text-ink-2">{event.priceNotes}</p>}
              {event.ticketUrl && (
                <p className="mt-2">
                  <a className="inline-flex min-h-11 items-center rounded-sm bg-wuwf-blue-700 px-5 text-base font-bold text-surface hover:bg-wuwf-blue-600 hover:no-underline" href={event.ticketUrl} rel="noopener noreferrer nofollow ugc">
                    Tickets or registration
                  </a>
                </p>
              )}
            </section>
          )}

          {(org.name || org.website || org.email || org.phone) && (
            <section>
              <h2 className={label}>Presented by</h2>
              {org.name && <p className="mt-1 text-base font-semibold text-ink">{org.name}</p>}
              <ul className="flex flex-col text-base">
                {org.website && (
                  <li>
                    <a className={`${link} inline-flex min-h-11 items-center`} href={org.website} rel="noopener noreferrer nofollow ugc">
                      {shown(org.website)}
                    </a>
                  </li>
                )}
                {org.email && (
                  <li>
                    <a className={`${link} inline-flex min-h-11 items-center`} href={`mailto:${org.email}`}>
                      {org.email}
                    </a>
                  </li>
                )}
                {org.phone && (
                  <li>
                    <a className={`${link} inline-flex min-h-11 items-center`} href={`tel:${org.phone.replace(/[^0-9+]/g, '')}`}>
                      {org.phone}
                    </a>
                  </li>
                )}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </article>
  )
}
