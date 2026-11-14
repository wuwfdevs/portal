import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import React from 'react'

import { TableLink } from '@/components/Listening/TableLink'
import { eyebrow } from '@/components/Listening/styles'
import { LISTENING_NOT_SET_UP } from '@/lib/listening/messages'
import { readTableSession, isTableLinkToken } from '@/lib/listening/table-session'
import { getListeningConfig } from '@/lib/listening/config-server'

export const dynamic = 'force-dynamic'

/**
 * The address a table card's QR code opens (board 5f), and where a started kitchen table lands (`?host=kitchen`). The page does not use the link: a person presses the button. Until then
 * nothing is sent to the Portal, so a previewer that fetches this page cannot use up the card. A phone that already holds a table
 * goes straight to it (a reload of this address after the link was used must not strand the facilitator).
 */
export default async function TableLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ host?: string }>
}) {
  const { token } = await params
  const kitchen = (await searchParams).host === 'kitchen'
  if (!isTableLinkToken(token)) notFound()
  if (await readTableSession()) redirect('/listens/session')

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col gap-4 px-5 py-8">
      <span className={eyebrow}>WUWF Listens</span>
      <h1 className="font-serif text-[1.75rem] font-bold leading-tight">{kitchen ? 'Your table is ready.' : 'You scanned a table’s card.'}</h1>
      <p className="text-[0.9375rem] text-ink-2">
        {kitchen
          ? 'This phone will record your table. Set it down where everyone can hear it, with the screen on and plugged in if you can. Next you will read a short agreement aloud, and nothing records until everyone at the table says yes.'
          : 'This phone will record that table tonight. Keep it on the table, with the screen on.'}
      </p>
      {(await getListeningConfig()) ? <TableLink kitchen={kitchen} token={token} /> : <p className="text-base text-ink-2">{LISTENING_NOT_SET_UP}</p>}
    </main>
  )
}

export const metadata: Metadata = {
  title: 'Open your table',
  robots: { index: false, follow: false },
  // The token is in the address: never hand it to another origin in a Referer header.
  referrer: 'no-referrer',
}
