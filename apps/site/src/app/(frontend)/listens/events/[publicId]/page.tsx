import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React, { cache } from 'react'

import { LISTENING_PATHS, type ListeningPublicEvent } from '@wuwf/portal-contracts'

import { SeatForm } from '@/components/Listening/SeatForm'
import { eyebrow, noticeInfo } from '@/components/Listening/styles'
import { eventIsFull, formatEventPlace, formatEventWhen, seatsSentence } from '@/lib/listening/event'
import { LISTENING_NOT_SET_UP } from '@/lib/listening/messages'
import { callListening } from '@/lib/listening/portal'
import { currentClientHash } from '@/lib/listening/request-context'
import { isPublicId } from '@/lib/listening/results'

export const dynamic = 'force-dynamic'

type Loaded = { kind: 'ok'; event: ListeningPublicEvent } | { kind: 'not_available' } | { kind: 'not_set_up' } | { kind: 'unavailable' }

// One read per request, whether the page or its metadata asks first.
const load = cache(async (publicId: string): Promise<Loaded> => {
  const hash = await currentClientHash()
  const result = await callListening<{ event: ListeningPublicEvent }>(LISTENING_PATHS.event, { publicId, ...(hash ? { clientHash: hash } : {}) })
  if (result.ok) return { kind: 'ok', event: result.event }
  if (result.error === 'not_set_up') return { kind: 'not_set_up' }
  // An event that is not listed, not scheduled, or whose campaign is not open answers the same as one that does not exist.
  if (result.error === 'not_available' || result.error === 'not_found') return { kind: 'not_available' }
  return { kind: 'unavailable' }
})

/** A public listening session's page: when and where, who is hosting, and a way to save a seat. */
export default async function EventPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params
  if (!isPublicId(publicId)) notFound()
  const loaded = await load(publicId)
  if (loaded.kind === 'not_available') notFound()
  if (loaded.kind !== 'ok') {
    return (
      <section className="container py-16">
        <p className="max-w-2xl text-lg text-ink-2">{loaded.kind === 'not_set_up' ? LISTENING_NOT_SET_UP : "We couldn't load this session just now. Try again in a moment."}</p>
      </section>
    )
  }

  const { event } = loaded
  const full = eventIsFull(event)
  const seats = seatsSentence(event.seatsLeft)

  return (
    <section className="container flex flex-col gap-6 py-12 md:py-14">
      <div className="flex max-w-2xl flex-col gap-3">
        <Link className="text-sm font-bold" href="/listens">
          ← WUWF Listens
        </Link>
        <span className={eyebrow}>Listening session{event.organizerLabel ? ` · hosted by ${event.organizerLabel}` : ''}</span>
        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight md:text-5xl">{event.title}</h1>
        <p className="font-serif text-xl leading-snug text-ink-2">{formatEventWhen(event.startsAt, event.endsAt)}</p>
        <p className="text-lg text-ink-2">{formatEventPlace(event)}</p>
        {event.journalistJoining && <p className={noticeInfo}>A WUWF journalist plans to join this session.</p>}
        {seats && <p className="text-base font-semibold text-ink">{seats}</p>}
      </div>
      {full ? (
        <p className="max-w-xl text-base text-ink-2">
          Every seat is taken. You can still <Link href="/listens/host">host a session of your own</Link>, or answer a question from home at <Link href="/listens">WUWF Listens</Link>.
        </p>
      ) : (
        <SeatForm publicId={publicId} />
      )}
    </section>
  )
}

export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }): Promise<Metadata> {
  const { publicId } = await params
  if (!isPublicId(publicId)) return { title: 'Listening session' }
  const loaded = await load(publicId)
  return loaded.kind === 'ok'
    ? { title: loaded.event.title, description: `${formatEventWhen(loaded.event.startsAt, loaded.event.endsAt)}. ${formatEventPlace(loaded.event)}.` }
    : { title: 'Listening session', robots: { index: false, follow: false } }
}
