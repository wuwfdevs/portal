import type { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import { TableSession } from '@/components/Listening/TableSession'
import { eyebrow } from '@/components/Listening/styles'
import { LISTENING_NOT_SET_UP, listeningMessage } from '@/lib/listening/messages'
import { loadConversationState, loadTableState } from '@/lib/listening/table-load'

export const dynamic = 'force-dynamic'

/** A table's phone (boards 5d and 5f): the agreement, the recording and the prompts. The session is the cookie set when the link was used. */
export default async function SessionPage() {
  const loaded = await loadTableState()

  if (loaded.kind === 'ok') {
    // A page that opens after the table has ended asks the Portal what it holds, so it never says the whole recording is in on a guess.
    const ended = loaded.table.state === 'ended' || loaded.table.state === 'sent'
    const conversation = ended ? await loadConversationState() : null
    const status = conversation && conversation.kind === 'ok' ? conversation.conversation.status : null
    return <TableSession conversationStatus={status} initial={loaded.table} />
  }

  const message =
    loaded.kind === 'no_session'
      ? 'This phone is not on a table. Scan the QR code on your table’s card to open it.'
      : loaded.kind === 'not_set_up'
        ? LISTENING_NOT_SET_UP
        : loaded.kind === 'refused'
          ? loaded.code === 'not_found' || loaded.code === 'link_used'
            ? 'This table’s link has ended or was replaced. Ask someone at the welcome table for a new one.'
            : listeningMessage(loaded.code)
          : "We couldn't reach WUWF just now. Reload this page in a moment; a recording in progress is not affected."

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col gap-4 px-5 py-8">
      <span className={eyebrow}>WUWF Listens</span>
      <h1 className="font-serif text-[1.75rem] font-bold leading-tight">Your table</h1>
      <p className="text-[0.9375rem] text-ink-2">{message}</p>
      <Link className="text-sm font-bold" href="/listens">
        WUWF Listens
      </Link>
    </main>
  )
}

export const metadata: Metadata = { title: 'Your table', robots: { index: false, follow: false } }
