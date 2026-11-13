import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import React from 'react'

import { ClaimRoom } from '@/components/Listening/ClaimRoom'
import { eyebrow } from '@/components/Listening/styles'
import { supabaseAudienceAuth } from '@/lib/audience/supabase'
import { readListeningConfig } from '@/lib/listening/config'
import { LISTENING_NOT_SET_UP } from '@/lib/listening/messages'
import { isTableLinkToken } from '@/lib/listening/table-token'

export const dynamic = 'force-dynamic'

/**
 * What the organizer's link opens. It needs a site account, because the Portal records the account as the organizer; nobody needs one
 * for anything else on this site. Nothing is sent to the Portal until a person presses the button.
 */
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isTableLinkToken(token)) notFound()

  const user = await supabaseAudienceAuth.currentUser()
  if (!user) redirect(`/account/sign-in?next=${encodeURIComponent(`/listens/room/claim/${token}`)}`)

  return (
    <section className="container flex flex-col gap-5 py-12 md:py-14">
      <div className="flex max-w-2xl flex-col gap-3">
        <Link className="text-sm font-bold" href="/listens">
          ← WUWF Listens
        </Link>
        <span className={eyebrow}>Organizer</span>
        <h1 className="font-serif text-3xl font-bold leading-tight md:text-4xl">Run a listening session&rsquo;s room.</h1>
      </div>
      {readListeningConfig() ? <ClaimRoom email={user.email} token={token} /> : <p className="text-base text-ink-2">{LISTENING_NOT_SET_UP}</p>}
    </section>
  )
}

export const metadata: Metadata = {
  title: 'Organizer link',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}
