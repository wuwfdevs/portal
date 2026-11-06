import configPromise from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { supabaseAudienceAuth } from '@/lib/audience/supabase'
import { formatLongDate } from '@/lib/format'
import { membershipStatus } from '@/lib/members/claim'

import { signOut } from './actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your account', robots: { index: false, follow: false } }

type Args = { searchParams: Promise<{ connected?: string }> }

/**
 * A reader's account (phases 7b, 7c; board 25 is its fuller form): who is signed in, their members' listening, and signing out.
 * Member feeds (7d) arrive here when they exist; until then this page does not promise them.
 */
export default async function AccountPage({ searchParams }: Args) {
  const user = await supabaseAudienceAuth.currentUser()
  if (!user) redirect('/account/sign-in')
  const { connected } = await searchParams
  const payload = await getPayload({ config: configPromise })
  const [status, support] = await Promise.all([
    membershipStatus(payload, user.id, new Date()),
    payload.findGlobal({ slug: 'support-page', depth: 0, overrideAccess: false }).catch(() => null),
  ])
  const level = support?.membersListeningLevel?.trim() || null

  return (
    <main className="container flex max-w-[44rem] flex-col gap-8 py-12 md:py-16">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">Your account</p>
        <h1 className="font-serif text-4xl font-bold leading-tight text-ink">Your WUWF account</h1>
        {user.email && (
          <p className="text-lg text-ink-2">
            Signed in as <strong className="text-ink">{user.email}</strong>
          </p>
        )}
      </header>

      <section aria-labelledby="membership-heading" className="flex flex-col gap-3 rounded-sm border border-rule bg-surface-2 p-6">
        <h2 className="font-serif text-2xl font-bold text-ink" id="membership-heading">
          Membership
        </h2>
        {connected === '1' && status.state === 'active' && (
          <p className="text-base font-semibold text-ink" role="status">
            Your membership is connected. Thank you for supporting WUWF.
          </p>
        )}
        {status.state === 'active' && status.inGrace ? (
          <p className="text-base text-ink-2">
            Your membership ended on <strong className="text-ink">{formatLongDate(status.endsOn)}</strong>. Members&rsquo; listening keeps working for a few more days
            while it renews.
          </p>
        ) : status.state === 'active' ? (
          <p className="text-base text-ink-2">
            Members&rsquo; listening is on: members-only episodes and more from WUWF originals. Your membership runs through{' '}
            <strong className="text-ink">{formatLongDate(status.endsOn)}</strong>.
          </p>
        ) : status.state === 'ended' ? (
          <p className="text-base text-ink-2">
            Your membership ended on <strong className="text-ink">{formatLongDate(status.endsOn)}</strong>, so members&rsquo; listening is off. Renewing your sustaining membership turns it back on.
          </p>
        ) : (
          <p className="text-base text-ink-2">
            Your account is not connected to a WUWF membership.
            {level ? ` Members' listening comes with ${level}.` : ''} If you are a sustaining member, WUWF Member Services can email you a link that connects it.
          </p>
        )}
        <Link className="self-start text-base font-semibold text-wuwf-blue-700 underline" href="/support">
          Ways to support WUWF
        </Link>
      </section>

      <form action={signOut}>
        <button className="inline-flex min-h-12 items-center rounded-sm border border-rule-strong px-6 text-base font-bold text-ink hover:bg-surface-2" type="submit">
          Sign out
        </button>
      </form>
    </main>
  )
}
