import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import React from 'react'

import { TableLink } from '@/components/Listening/TableLink'
import { eyebrow } from '@/components/Listening/styles'
import { LISTENING_NOT_SET_UP } from '@/lib/listening/messages'
import { readTableSession, isTableLinkToken } from '@/lib/listening/table-session'
import { readListeningConfig } from '@/lib/listening/config'

export const dynamic = 'force-dynamic'

/**
 * The address a table card's QR code opens (board 5f). The page does not use the link: a person presses the button. Until then
 * nothing is sent to the Portal, so a previewer that fetches this page cannot use up the card. A phone that already holds a table
 * goes straight to it (a reload of this address after the link was used must not strand the facilitator).
 */
export default async function TableLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isTableLinkToken(token)) notFound()
  if (await readTableSession()) redirect('/listens/session')

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col gap-4 px-5 py-8">
      <span className={eyebrow}>WUWF Listens</span>
      <h1 className="font-serif text-[1.75rem] font-bold leading-tight">You scanned a table&rsquo;s card.</h1>
      <p className="text-[0.9375rem] text-ink-2">This phone will record that table tonight. Keep it on the table, with the screen on.</p>
      {readListeningConfig() ? <TableLink token={token} /> : <p className="text-base text-ink-2">{LISTENING_NOT_SET_UP}</p>}
    </main>
  )
}

export const metadata: Metadata = {
  title: 'Open your table',
  robots: { index: false, follow: false },
  // The token is in the address: never hand it to another origin in a Referer header.
  referrer: 'no-referrer',
}
