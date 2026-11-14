import type { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import { AfterTable } from '@/components/Listening/AfterTable'
import { eyebrow } from '@/components/Listening/styles'
import { LISTENING_NOT_SET_UP, listeningMessage } from '@/lib/listening/messages'
import { loadConversationState } from '@/lib/listening/table-load'
import { readTableSession } from '@/lib/listening/table-session'

export const dynamic = 'force-dynamic'

/**
 * Board 5e: the facilitator's after-page. It opens from the link WUWF emails when the transcript is ready (the token is kept in a cookie
 * by `/listens/after/<token>`, and works for fourteen days), or from the phone that recorded while that table's own session lasts.
 * Only this table's conversation is read, rendered and dropped. This site stores none of it.
 */
export default async function AfterPage() {
  const loaded = await loadConversationState()
  const onTablePhone = (await readTableSession()) !== null

  let body: React.ReactNode
  if (loaded.kind === 'ok') {
    body = <AfterTable initial={loaded.conversation} />
  } else {
    const message =
      loaded.kind === 'no_session'
        ? 'This page opens from the link WUWF emails to the facilitator of each table once the transcript is ready. Open that email on this device, or ask WUWF to send it again.'
        : loaded.kind === 'not_set_up'
          ? LISTENING_NOT_SET_UP
          : loaded.kind === 'refused'
            ? loaded.code === 'not_found'
              ? 'This link has ended or was replaced by a newer one. Open the latest email from WUWF, or ask WUWF to send you a new link.'
              : listeningMessage(loaded.code)
            : "We couldn't reach WUWF just now. Reload this page in a moment."
    body = <p className="max-w-xl text-base text-ink-2">{message}</p>
  }

  return (
    <section className="container flex flex-col gap-6 py-10 md:py-12">
      <div className="flex flex-col gap-2">
        {onTablePhone && (
          <Link className="text-sm font-bold" href="/listens/session">
            ← Your table
          </Link>
        )}
        <span className={eyebrow}>Your conversation</span>
        <h1 className="font-serif text-3xl font-bold leading-tight md:text-4xl">Put names to your table, and mark what mattered.</h1>
      </div>
      {body}
    </section>
  )
}

export const metadata: Metadata = { title: 'Your conversation', robots: { index: false, follow: false } }
