import configPromise from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import React from 'react'

import { supabaseAudienceAuth } from '@/lib/audience/supabase'
import { formatLongDate } from '@/lib/format'
import { membershipStatus } from '@/lib/members/claim'
import { memberFeedsFor } from '@/lib/members/feed-service'
import { podcastAppLinks } from '@/lib/members/feeds'
import { siteOrigin } from '@/lib/audience/origin'
import { derivedSecret } from '@/lib/audience/secret'
import { CopyFeedLink } from '@/components/Account/CopyFeedLink'

import { resetFeed, signOut } from './actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your account', robots: { index: false, follow: false } }

type Args = { searchParams: Promise<{ connected?: string; reset?: string }> }

/**
 * A reader's account (phases 7b, 7c; board 25 is its fuller form): who is signed in, their members' listening, and signing out.
 * A member also gets their private podcast feeds here (7d): one per show with members-only episodes, each with a reset.
 */
export default async function AccountPage({ searchParams }: Args) {
  const user = await supabaseAudienceAuth.currentUser()
  if (!user) redirect('/account/sign-in')
  const { connected, reset } = await searchParams
  const payload = await getPayload({ config: configPromise })
  const [status, support] = await Promise.all([
    membershipStatus(payload, user.id, new Date()),
    payload.findGlobal({ slug: 'support-page', depth: 0, overrideAccess: false }).catch(() => null),
  ])
  const level = support?.membersListeningLevel?.trim() || null
  const profile = status.state === 'active' ? (await payload.find({ collection: 'audience-profiles', where: { supabaseUserId: { equals: user.id } }, limit: 1, depth: 0, overrideAccess: true, pagination: false })).docs[0] : undefined
  const feeds = profile ? await memberFeedsFor(payload, profile.id as number, siteOrigin(), derivedSecret('member-feed')) : []

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

      {status.state === 'active' && (
        <section aria-labelledby="feeds-heading" className="flex scroll-mt-24 flex-col gap-4" id="feeds">
          <h2 className="font-serif text-2xl font-bold text-ink" id="feeds-heading">
            Your member feeds
          </h2>
          {reset === '1' && (
            <p className="text-base font-semibold text-ink" role="status">
              Done. The old address no longer works; add the new one below to your podcast app.
            </p>
          )}
          {feeds.length === 0 ? (
            <p className="text-base text-ink-2">No WUWF show has members-only episodes yet. When one does, its feed appears here.</p>
          ) : (
            <>
              <p className="text-base text-ink-2">
                Each feed below is yours alone. Add it to your podcast app once and members-only episodes arrive like any other show. The address carries your membership,
                so please do not share it. Spotify does not accept private feeds; Apple Podcasts, Overcast, Pocket Casts and most other apps do.
              </p>
              <ul className="flex flex-col gap-4">
                {feeds.map(({ show, url }) => (
                  <li className="flex flex-col gap-3 rounded-sm border border-rule p-5" key={show.id}>
                    <h3 className="font-serif text-xl font-bold text-ink">{show.title}</h3>
                    <CopyFeedLink label={`Your private feed address for ${show.title}`} url={url} />
                    <div className="flex flex-wrap gap-2">
                      {podcastAppLinks(url).map((l) => (
                        <a className="inline-flex min-h-11 items-center rounded-sm bg-ink px-4 text-sm font-bold text-surface hover:no-underline hover:opacity-90" href={l.href} key={l.app}>
                          Add to {l.app}
                        </a>
                      ))}
                    </div>
                    <form action={resetFeed}>
                      <input name="production" type="hidden" value={String(show.id)} />
                      <button className="min-h-11 text-sm font-semibold text-wuwf-blue-700 underline" type="submit">
                        Reset this feed (if the address was shared, or stopped working)
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <form action={signOut}>
        <button className="inline-flex min-h-12 items-center rounded-sm border border-rule-strong px-6 text-base font-bold text-ink hover:bg-surface-2" type="submit">
          Sign out
        </button>
      </form>
    </main>
  )
}
