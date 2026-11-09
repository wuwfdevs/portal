import type { Metadata } from 'next'
import React from 'react'

import { HubView } from '@/components/Listening/Hub'
import { PolicyNotice } from '@/components/Account/PolicyNotice'
import { LISTENING_NOT_SET_UP } from '@/lib/listening/messages'
import { loadHub } from '@/lib/listening/load'

// The hub reads the Portal on every request, with the reader's address hashed for the Portal's rate limit.
export const dynamic = 'force-dynamic'

export default async function ListensPage() {
  const loaded = await loadHub()

  if (loaded.kind !== 'ok') {
    return (
      <section className="container py-16">
        <h1 className="font-serif text-4xl font-bold">WUWF Listens</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-2">
          {loaded.kind === 'not_set_up' ? LISTENING_NOT_SET_UP : "We couldn't load the questions just now. Try again in a moment."}
        </p>
      </section>
    )
  }

  return (
    <>
      <HubView hub={loaded.hub} />
      <div className="container py-6">
        <PolicyNotice />
      </div>
    </>
  )
}

export const metadata: Metadata = {
  title: 'WUWF Listens',
  description: 'Answer a reporter’s question by voice or in writing, and see what came of the answers.',
}
