import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'

import { supabaseAudienceAuth } from '@/lib/audience/supabase'

import { signOut } from './actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your account', robots: { index: false, follow: false } }

/**
 * A reader's account (phase 7b; board 25 is its fuller form). Today: who is signed in, and signing out. Member feeds (7d) and the
 * membership link (7c) arrive here when they exist; until then this page promises neither.
 */
export default async function AccountPage() {
  const user = await supabaseAudienceAuth.currentUser()
  if (!user) redirect('/account/sign-in')

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
        <p className="text-base text-ink-2">
          Your account is not linked to a WUWF membership. Questions about a membership or a gift go to WUWF Member Services.
        </p>
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
