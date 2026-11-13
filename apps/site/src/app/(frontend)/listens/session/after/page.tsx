import type { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import { AfterTable } from '@/components/Listening/AfterTable'
import { eyebrow } from '@/components/Listening/styles'
import { LISTENING_NOT_SET_UP, listeningMessage } from '@/lib/listening/messages'
import { loadConversationState } from '@/lib/listening/table-load'

export const dynamic = 'force-dynamic'

/**
 * Board 5e: the facilitator's after-page. It is reached from the phone that held the table, because the table's session is the
 * only key to the conversation; it works until the Portal ends that session, about twelve hours after the session's end time.
 * Only this table's conversation is read, rendered and dropped. This site stores none of it.
 */
export default async function AfterPage() {
  const loaded = await loadConversationState()

  let body: React.ReactNode
  if (loaded.kind === 'ok') {
    body = <AfterTable initial={loaded.conversation} />
  } else {
    const message =
      loaded.kind === 'no_session'
        ? 'This page opens from the phone that recorded your table. If that was this phone, its link has ended. Ask WUWF for a new one.'
        : loaded.kind === 'not_set_up'
          ? LISTENING_NOT_SET_UP
          : loaded.kind === 'refused'
            ? loaded.code === 'not_found'
              ? 'This table’s link has ended or was replaced. Ask WUWF for a new one.'
              : listeningMessage(loaded.code)
            : "We couldn't reach WUWF just now. Reload this page in a moment."
    body = <p className="max-w-xl text-base text-ink-2">{message}</p>
  }

  return (
    <section className="container flex flex-col gap-6 py-10 md:py-12">
      <div className="flex flex-col gap-2">
        <Link className="text-sm font-bold" href="/listens/session">
          ← Your table
        </Link>
        <span className={eyebrow}>Your conversation</span>
        <h1 className="font-serif text-3xl font-bold leading-tight md:text-4xl">Put names to your table, and mark what mattered.</h1>
      </div>
      {body}
    </section>
  )
}

export const metadata: Metadata = { title: 'Your conversation', robots: { index: false, follow: false } }
