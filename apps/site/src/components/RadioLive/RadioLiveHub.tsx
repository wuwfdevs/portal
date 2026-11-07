import Link from 'next/link'
import React from 'react'

import { Acknowledgment } from '@/components/Acknowledgment'
import { Media } from '@/components/Media'
import { appearanceLine, dateParts, performanceTitle } from '@/lib/radiolive/arrange'
import type { RadioLiveData } from '@/lib/radiolive/load'

import { RecordingPlayer, ShowFrame, ShowLink } from './parts'

const kicker = 'text-xs font-bold uppercase tracking-widest'

/**
 * The RadioLive page (board 12): the next show, the latest recorded set, what is coming, past shows to watch, the artists, the host and
 * the Encores broadcast, a call to support, and the funders. Left out because nothing stands behind them: the lineup email, "tell me
 * when tickets go on sale", and the board's giving levels (the donation form takes the gift; the board marks its extras "proposed").
 */
export function RadioLiveHub({ data, independenceHref }: { data: RadioLiveData; independenceHref: string | null }) {
  const { upcoming, latest, watch, watchTotal, artists, host, encores, support, visit, membership, acknowledgments } = data
  const next = upcoming[0] ?? null
  const nextWhen = next ? dateParts(next.startsAt) : null
  return (
    <div className="bg-surface-dark pb-0 text-surface">
      <div className="border-b border-surface-dark-line">
        <div className="container flex min-h-[3.75rem] flex-wrap items-center gap-x-7 gap-y-2 py-2">
          <span className="font-serif text-2xl font-bold">RadioLive</span>
          <nav aria-label="RadioLive" className="flex w-full flex-wrap gap-x-5 gap-y-0 text-sm font-bold md:w-auto md:flex-1">
            {[['shows', 'Shows'], ['watch', 'Watch'], ['artists', 'Artists'], ['encores', 'Encores'], ['about', 'About'], ['support', 'Support']].map(([id, label]) => (
              <a className="inline-flex min-h-11 items-center text-surface" href={`#${id}`} key={id}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <header className="relative">
        <div className="relative h-[26rem] bg-surface-dark-hover md:h-[34rem]">
          {data.heroPhoto && <Media imgClassName="absolute inset-0 size-full object-cover" priority resource={data.heroPhoto} />}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-surface-dark/90">
          <div className="container flex flex-wrap items-end gap-x-12 gap-y-4 py-6 md:py-8">
            <div className="flex min-w-0 flex-[999_1_30rem] flex-col gap-3">
              {next && nextWhen ? (
                <>
                  <p className={`${kicker} self-start rounded-full border border-surface-dark-line px-3 py-1 text-wuwf-lime`}>
                    Next show · {nextWhen.weekday}, {nextWhen.long} · {nextWhen.time}
                  </p>
                  <h1 className="font-serif text-3xl font-bold leading-tight md:text-6xl">
                    <ShowLink className="text-surface hover:no-underline" show={next}>
                      {performanceTitle(next)}
                    </ShowLink>
                  </h1>
                  <p className="text-lg text-surface-dark-text">{[next.venue, 'on the air on 88.1 FM'].filter(Boolean).join(' · ')}</p>
                </>
              ) : (
                <>
                  <h1 className="font-serif text-4xl font-bold leading-tight md:text-6xl">RadioLive</h1>
                  <p className="text-lg text-surface-dark-text">{data.tagline ?? 'No show is announced yet.'}</p>
                </>
              )}
            </div>
            {next && (
              <div className="flex flex-[1_1_18rem] flex-col gap-2.5">
                {next.tickets.href ? (
                  <a className="inline-flex min-h-[3.25rem] items-center justify-center rounded-sm bg-wuwf-lime px-6 text-base font-bold text-surface-dark hover:bg-surface hover:no-underline" href={next.tickets.href} rel="noopener noreferrer">
                    {next.tickets.label}
                  </a>
                ) : (
                  <p className="rounded-sm border border-surface-dark-line px-4 py-3 text-center font-bold">{next.tickets.label}</p>
                )}
                {next.virtualTickets && (
                  <a className="inline-flex min-h-11 items-center justify-center rounded-sm border border-surface-dark-text px-4 font-bold text-surface hover:no-underline" href={next.virtualTickets.href} rel="noopener noreferrer">
                    {next.virtualTickets.label}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {latest && (
        <section aria-label="Latest recorded set" className="container flex flex-wrap items-center gap-8 py-12">
          <div className="min-w-0 flex-[1_1_32rem]">
            <RecordingPlayer show={latest} />
          </div>
          <div className="flex min-w-0 flex-[1_1_24rem] flex-col gap-3.5">
            <p className={`${kicker} text-wuwf-lime`}>Latest set · {dateParts(latest.startsAt).long}</p>
            <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{performanceTitle(latest)}</h2>
            {latest.description && <p className="text-lg text-surface-dark-text">{latest.description}</p>}
            <div className="flex flex-wrap gap-2">
              <ShowLink className="inline-flex min-h-11 items-center rounded-sm border border-surface-dark-text px-4 font-bold text-surface hover:no-underline" show={latest}>
                About this show
              </ShowLink>
              <a className="inline-flex min-h-11 items-center px-4 font-bold text-wuwf-lime" href="#watch">
                Watch past shows
              </a>
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="shows-heading" className="bg-surface text-ink" id="shows">
        <div className="container flex flex-wrap gap-x-12 gap-y-8 py-12">
          <div className="min-w-0 flex-[999_1_32rem]">
          <p className={`${kicker} text-wuwf-blue-700`}>Upcoming</p>
          <h2 className="mb-4 mt-1 font-serif text-3xl font-bold" id="shows-heading">
            Save your seat
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-lg text-ink-2">No shows are announced yet. Check back soon.</p>
          ) : (
            <ul>
              {upcoming.map((s) => {
                const d = dateParts(s.startsAt)
                return (
                  <li className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-rule py-5 first:border-t" key={s.slug}>
                    <div aria-hidden="true" className="flex w-[4.5rem] flex-col items-center rounded-sm bg-surface-2 py-2">
                      <span className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">{d.month}</span>
                      <span className="font-serif text-3xl font-bold leading-tight">{d.day}</span>
                    </div>
                    <div className="min-w-0 flex-[999_1_16rem]">
                      <Link className="block font-serif text-xl font-bold leading-snug text-ink hover:text-wuwf-blue-700" href={`/radiolive/${s.slug}`}>
                        {performanceTitle(s)}
                      </Link>
                      <p className="text-sm text-ink-3">
                        {d.weekday}, {d.long} · {d.time}
                        {s.venue ? ` · ${s.venue}` : ''}
                      </p>
                    </div>
                    {s.tickets.href ? (
                      <a className="inline-flex min-h-11 items-center rounded-sm bg-wuwf-blue-700 px-4 text-sm font-bold text-surface hover:bg-wuwf-blue-600 hover:no-underline" href={s.tickets.href} rel="noopener noreferrer">
                        {s.tickets.label}
                      </a>
                    ) : (
                      <span className="rounded-full bg-surface-3 px-3 py-1 text-xs font-bold text-ink-2">{s.tickets.label}</span>
                    )}
                    {s.virtualTickets && (
                      <a className="inline-flex min-h-11 items-center text-sm font-bold text-wuwf-blue-700 underline" href={s.virtualTickets.href} rel="noopener noreferrer">
                        {s.virtualTickets.label}
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          </div>
          {visit.items.length > 0 && (
            <aside aria-labelledby="visit-heading" className="flex-[1_1_18rem] self-start rounded-sm border border-rule bg-surface-2 p-5">
              <h2 className="font-serif text-xl font-bold" id="visit-heading">
                {visit.heading ?? 'Plan your visit'}
              </h2>
              <dl className="mt-3 flex flex-col gap-3">
                {visit.items.map((i) => (
                  <div key={i.label}>
                    <dt className="text-xs font-bold uppercase tracking-widest text-ink-3">{i.label}</dt>
                    <dd className="text-base text-ink">{i.text}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          )}
        </div>
      </section>

      <section aria-labelledby="watch-heading" className="container flex flex-col gap-6 py-14" id="watch">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-serif text-3xl font-bold md:text-4xl" id="watch-heading">
            Watch recent shows
          </h2>
          <span className="text-sm text-surface-dark-text">Full sets · {watchTotal} in the archive</span>
        </div>
        {watch.length === 0 ? (
          <p className="text-lg text-surface-dark-text">Full sets appear here once each show is edited.</p>
        ) : (
          <ul className="grid gap-7 [grid-template-columns:repeat(auto-fit,minmax(min(100%,21rem),1fr))]">
            {watch.map((s) => (
              <li key={s.slug}>
                <ShowLink className="flex flex-col gap-2.5 text-surface hover:no-underline" show={s}>
                  <ShowFrame className="aspect-[880/542] w-full" show={s} />
                  <span className="font-serif text-xl font-semibold leading-snug">{performanceTitle(s)}</span>
                </ShowLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      {artists.length > 0 && (
        <section aria-labelledby="artists-heading" className="border-y border-surface-dark-line bg-surface-dark-hover" id="artists">
          <div className="container flex flex-col gap-6 py-14">
            <h2 className="font-serif text-3xl font-bold md:text-4xl" id="artists-heading">
              Artists
            </h2>
            <ul className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,9.5rem),1fr))]">
              {artists.map((a) => (
                <li key={a.slug}>
                  <Link className="flex flex-col gap-2 text-surface hover:no-underline" href={`/radiolive/artists/${a.slug}`}>
                    <span className="relative block aspect-[4/5] overflow-hidden rounded-sm border border-surface-dark-line bg-surface-dark">
                      {a.photo && <Media imgClassName="absolute inset-0 size-full object-cover" resource={a.photo} size="20vw" />}
                    </span>
                    <strong className="text-lg leading-snug">{a.name}</strong>
                    <span className="text-sm text-surface-dark-text">{appearanceLine(a)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="container flex flex-wrap gap-6 py-14" id="about">
        {(host.heading || host.text) && (
          <div className="flex min-w-0 flex-[999_1_32rem] flex-wrap gap-6 rounded-lg border border-surface-dark-line p-7">
            {host.portrait && (
              <div className="relative aspect-square w-[8.75rem] shrink-0 overflow-hidden rounded-sm bg-surface-dark-hover">
                <Media imgClassName="absolute inset-0 size-full object-cover" resource={host.portrait} size="140px" />
              </div>
            )}
            <div className="flex min-w-0 flex-[1_1_17rem] flex-col gap-2">
              {host.kicker && <p className={`${kicker} text-wuwf-lime`}>{host.kicker}</p>}
              {host.heading && <h2 className="font-serif text-2xl font-bold leading-snug">{host.heading}</h2>}
              {host.text && <p className="text-surface-dark-text">{host.text}</p>}
              {host.href && (
                <Link className="inline-flex min-h-11 items-center font-bold" href={host.href}>
                  The story of RadioLive
                </Link>
              )}
            </div>
          </div>
        )}
        {(encores.heading || encores.text) && (
          <div className="flex min-w-0 flex-[1_1_21rem] flex-col gap-2.5 rounded-lg bg-wuwf-teal p-7" id="encores">
            <p className={`${kicker} text-wuwf-lime`}>RadioLive Encores</p>
            {encores.heading && <h2 className="font-serif text-2xl font-bold leading-snug">{encores.heading}</h2>}
            {encores.text && <p className="text-wuwf-blue-100">{encores.text}</p>}
            {encores.href && (
              <Link className="mt-1 inline-flex min-h-12 items-center justify-center rounded-sm bg-wuwf-lime px-4 font-bold text-surface-dark hover:bg-surface hover:no-underline" href={encores.href}>
                {encores.linkLabel ?? 'Open the audio archive'}
              </Link>
            )}
          </div>
        )}
      </section>

      {(support.heading || support.text || membership) && (
        <section aria-label="Support RadioLive" className="bg-surface text-ink" id="support">
          <div className="container flex flex-wrap items-start gap-x-10 gap-y-4 py-14">
            <div className="flex min-w-0 flex-[1_1_26rem] flex-col gap-3">
              <p className={`${kicker} text-wuwf-blue-700`}>Support RadioLive</p>
              {support.heading && <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{support.heading}</h2>}
              {support.text && <p className="text-lg text-ink-2">{support.text}</p>}
            </div>
            <div className="flex flex-[1_1_20rem] flex-col items-start gap-3">
              {support.href && (
                <Link className="inline-flex min-h-[3.25rem] items-center rounded-sm bg-wuwf-blue-700 px-7 text-base font-bold text-surface hover:bg-wuwf-blue-600 hover:no-underline" href={support.href}>
                  {support.buttonLabel ?? 'Give to RadioLive'}
                </Link>
              )}
              {support.note && <p className="text-sm text-ink-3">{support.note}</p>}
            </div>
            {membership && (
              <div className="flex basis-full flex-col gap-2 rounded-sm border border-rule bg-surface-2 p-6">
                <h3 className="font-serif text-2xl font-bold">{membership.heading}</h3>
                {membership.text && <p className="max-w-[48rem] text-base text-ink-2">{membership.text}</p>}
                {(membership.contactName || membership.mailto || membership.tel) && (
                  <p className="text-base text-ink">
                    For more information, contact {membership.contactName ?? 'us'}
                    {membership.mailto && (
                      <>
                        {' at '}
                        <a className="font-semibold text-wuwf-blue-700 underline" href={membership.mailto}>
                          {membership.email}
                        </a>
                      </>
                    )}
                    {membership.tel && (
                      <>
                        {membership.mailto ? ' or ' : ' at '}
                        <a className="font-semibold text-wuwf-blue-700 underline" href={membership.tel}>
                          {membership.phone}
                        </a>
                      </>
                    )}
                    .
                  </p>
                )}
                {membership.href && (
                  <Link className="inline-flex min-h-11 items-center self-start font-bold text-wuwf-blue-700 underline" href={membership.href}>
                    Learn more
                  </Link>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {acknowledgments.length > 0 && (
        <section aria-label="Funding" className="bg-surface text-ink">
          <div className="container max-w-[52rem] pb-12">
            <Acknowledgment independenceHref={independenceHref} lines={acknowledgments} subject="program" />
          </div>
        </section>
      )}
    </div>
  )
}
