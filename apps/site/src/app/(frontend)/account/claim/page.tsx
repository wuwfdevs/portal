import configPromise from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from 'payload'
import React from 'react'

import { supabaseAudienceAuth } from '@/lib/audience/supabase'
import { checkClaim } from '@/lib/members/claim'
import { formatLongDate } from '@/lib/format'

import { connectMembership } from '../actions'

export const dynamic = 'force-dynamic'
// The link carries the claim token: keep it out of search, out of caches and out of any Referer header.
export const metadata: Metadata = { title: 'Connect your membership', robots: { index: false, follow: false }, referrer: 'no-referrer' }

type Args = { searchParams: Promise<{ token?: string; error?: string }> }

const box = 'flex flex-col gap-4 rounded-sm border border-rule bg-surface-2 p-6'
const primary = 'inline-flex min-h-12 items-center justify-center self-start rounded-sm bg-wuwf-blue-700 px-6 text-base font-bold text-surface hover:bg-wuwf-blue-600 hover:no-underline'

/**
 * Where a membership claim email lands (phase 7c). Opening it never claims anything (mail scanners open links): the reader signs
 * in, sees which account the membership will be connected to, and presses the button.
 */
export default async function ClaimPage({ searchParams }: Args) {
  const { token, error } = await searchParams
  const payload = await getPayload({ config: configPromise })
  const [user, check] = await Promise.all([supabaseAudienceAuth.currentUser(), checkClaim(payload, token, new Date())])

  let body: React.ReactNode
  if (check.kind === 'invalid') {
    body = (
      <div className={box}>
        <h2 className="font-serif text-2xl font-bold text-ink">This link cannot be used</h2>
        <p className="text-base text-ink-2">It has already been used, or it is not complete. If your membership is not connected yet, WUWF Member Services can send you a new link.</p>
        <Link className="self-start font-semibold text-wuwf-blue-700 underline" href="/account">
          Go to your account
        </Link>
      </div>
    )
  } else if (check.kind === 'expired') {
    body = (
      <div className={box}>
        <h2 className="font-serif text-2xl font-bold text-ink">This link has expired</h2>
        <p className="text-base text-ink-2">Claim links work for 14 days. WUWF Member Services can send you a new one.</p>
      </div>
    )
  } else if (!user) {
    const back = `/account/claim?token=${encodeURIComponent(String(token))}`
    body = (
      <div className={box}>
        <h2 className="font-serif text-2xl font-bold text-ink">Sign in to connect your membership</h2>
        <p className="text-base text-ink-2">Sign in with any email address you like (we send you a link; there is no password). Then you come back here to connect it.</p>
        <Link className={primary} href={`/account/sign-in?next=${encodeURIComponent(back)}`}>
          Sign in
        </Link>
      </div>
    )
  } else {
    body = (
      <form action={connectMembership} className={box}>
        <input name="token" type="hidden" value={String(token)} />
        <h2 className="font-serif text-2xl font-bold text-ink">Connect your membership</h2>
        <p className="text-base text-ink-2">
          This connects the WUWF membership for <strong className="text-ink">{check.membership.name}</strong> (through {formatLongDate(check.membership.endsOn)}) to the account
          you are signed in with{user.email ? <>, <strong className="text-ink">{user.email}</strong></> : null}.
        </p>
        {error === 'failed' && (
          <p className="text-base font-semibold text-on-air-red" role="alert">
            That did not work. Please try again.
          </p>
        )}
        <button className={primary} type="submit">
          Connect my membership
        </button>
      </form>
    )
  }

  return (
    <main className="container flex max-w-[40rem] flex-col gap-6 py-12 md:py-16">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">Your WUWF account</p>
        <h1 className="font-serif text-4xl font-bold leading-tight text-ink">Your membership</h1>
      </header>
      {body}
    </main>
  )
}
