import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import { ContactCard } from '@/components/Listening/ContactCard'
import { eyebrow } from '@/components/Listening/styles'
import { LISTENING_PATHS } from '@wuwf/portal-contracts'
import { LISTENING_NOT_SET_UP, listeningMessage } from '@/lib/listening/messages'
import { callListening } from '@/lib/listening/portal'
import { currentClientHash } from '@/lib/listening/request-context'
import { isTableLinkToken } from '@/lib/listening/table-token'

export const dynamic = 'force-dynamic'

/**
 * Board 5i: what the table's second QR code opens, on a participant's own phone. Reading it uses nothing up: the token names the
 * table, not a person, and each person who saves a card makes their own.
 */
export default async function CardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isTableLinkToken(token)) notFound()

  const hash = await currentClientHash()
  const opened = await callListening<{ eventTitle: string; tableNumber: number }>(LISTENING_PATHS.contactCardOpen, { cardToken: token, ...(hash ? { clientHash: hash } : {}) })

  let body: React.ReactNode
  if (opened.ok) {
    body = <ContactCard cardToken={token} eventTitle={opened.eventTitle} tableNumber={opened.tableNumber} />
  } else if (opened.error === 'not_set_up') {
    body = <p className="text-base text-ink-2">{LISTENING_NOT_SET_UP}</p>
  } else if (opened.error === 'not_found' || opened.error === 'not_available') {
    // A wrong or replaced card and a card for a conversation that has closed look the same from here.
    body = <p className="text-base text-ink-2">This card is not taking contact details. If you were at a table and still want WUWF to be able to reach you, write to us through WUWF Listens.</p>
  } else {
    body = <p className="text-base text-ink-2">{listeningMessage(opened.error)}</p>
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col">
      <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
        <span className="text-[0.8125rem] font-bold">WUWF Listens</span>
        <Link className="text-[0.8125rem]" href="/listens">
          About
        </Link>
      </div>
      <main className="flex flex-1 flex-col gap-4 px-5 py-5">
        <span className={eyebrow}>Your contact card</span>
        {body}
      </main>
    </div>
  )
}

export const metadata: Metadata = {
  title: 'Your contact card',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}
