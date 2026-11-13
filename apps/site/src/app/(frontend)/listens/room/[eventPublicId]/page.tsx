import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import React from 'react'

import { LISTENING_PATHS, type ListeningRoom } from '@wuwf/portal-contracts'

import { RoomConsole } from '@/components/Listening/RoomConsole'
import { eyebrow } from '@/components/Listening/styles'
import { supabaseAudienceAuth } from '@/lib/audience/supabase'
import { LISTENING_NOT_SET_UP } from '@/lib/listening/messages'
import { callListening } from '@/lib/listening/portal'
import { currentClientHash } from '@/lib/listening/request-context'
import { isPublicId } from '@/lib/listening/results'

export const dynamic = 'force-dynamic'

/**
 * Board 5g: the organizer's console for one event. It needs a site account, because the Portal answers only a subject that owns
 * the event; nobody else needs an account for anything on this site. An account that does not own the event is told the same
 * thing as one for an event that does not exist, so a console address cannot be probed.
 */
export default async function RoomPage({ params }: { params: Promise<{ eventPublicId: string }> }) {
  const { eventPublicId } = await params
  if (!isPublicId(eventPublicId)) notFound()

  const user = await supabaseAudienceAuth.currentUser()
  if (!user) redirect(`/account/sign-in?next=${encodeURIComponent(`/listens/room/${eventPublicId}`)}`)

  const hash = await currentClientHash()
  const result = await callListening<{ room: ListeningRoom }>(LISTENING_PATHS.room, {
    subject: { kind: 'account', id: user.id },
    eventPublicId,
    ...(hash ? { clientHash: hash } : {}),
  })

  let body: React.ReactNode
  if (result.ok) {
    body = <RoomConsole eventPublicId={eventPublicId} initial={result.room} />
  } else if (result.error === 'not_set_up') {
    body = <p className="text-base text-ink-2">{LISTENING_NOT_SET_UP}</p>
  } else if (result.error === 'not_found' || result.error === 'not_available') {
    body = (
      <p className="max-w-xl text-base text-ink-2">
        This account does not run an event with that address, or the event is not open. If you are organizing a session, ask WUWF to link the event to the account you signed in with
        ({user.email ?? 'this account'}).
      </p>
    )
  } else {
    body = <p className="max-w-xl text-base text-ink-2">We couldn&rsquo;t load the room just now. Reload this page in a moment.</p>
  }

  return (
    <section className="container flex flex-col gap-6 py-10 md:py-12">
      <div className="flex flex-col gap-2">
        <Link className="text-sm font-bold" href="/listens">
          ← WUWF Listens
        </Link>
        <span className={eyebrow}>Organizer</span>
        <h1 className="font-serif text-3xl font-bold leading-tight md:text-4xl">{result.ok ? result.room.title : 'Your listening session'}</h1>
      </div>
      {body}
    </section>
  )
}

export const metadata: Metadata = { title: 'Organizer console', robots: { index: false, follow: false } }
