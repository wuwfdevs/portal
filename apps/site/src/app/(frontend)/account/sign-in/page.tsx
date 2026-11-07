import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import React from 'react'

import { PolicyNotice } from '@/components/Account/PolicyNotice'
import { SignInForm } from '@/components/Account/SignInForm'
import { safeNext } from '@/lib/audience/rules'
import { supabaseAudienceAuth, supabaseAuthConfig } from '@/lib/audience/supabase'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } }

type Args = { searchParams: Promise<{ next?: string; error?: string }> }

/** Sign in to wuwf.org (phase 7b). Nobody needs an account to read, listen, give or answer a question. */
export default async function SignInPage({ searchParams }: Args) {
  const { next: rawNext, error } = await searchParams
  const next = safeNext(rawNext)
  if (await supabaseAudienceAuth.currentUser()) redirect(next)
  const configured = supabaseAuthConfig() !== null

  return (
    <main className="container flex max-w-[36rem] flex-col gap-6 py-12 md:py-16">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">Your WUWF account</p>
        <h1 className="font-serif text-4xl font-bold leading-tight text-ink">Sign in</h1>
        <p className="text-lg text-ink-2">
          You never need an account to read, listen or give. An account is for things that belong to you, such as member benefits.
        </p>
      </header>
      {error === 'link' && (
        <p className="rounded-sm border-2 border-on-air-red p-4 text-base text-ink" role="alert">
          That sign-in link did not work. Links work once and expire after an hour. Ask for a new one below.
        </p>
      )}
      {configured ? (
        <SignInForm next={next} />
      ) : (
        <p className="rounded-sm border border-rule bg-surface-2 p-4 text-base text-ink-2">Signing in is not set up on this server yet.</p>
      )}
      <p className="text-sm text-ink-3">We use your email address only to sign you in.</p>
      <PolicyNotice />
    </main>
  )
}
