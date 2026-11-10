import type { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import { HostForm } from '@/components/Listening/HostForm'
import { eyebrow } from '@/components/Listening/styles'

/** Host a listening session (board 5c). The form works only if the Portal is set up; if it is not, sending says so. */
export default function HostPage() {
  return (
    <section className="container flex flex-col gap-6 py-12 md:py-14">
      <div className="flex max-w-2xl flex-col gap-3">
        <Link className="text-sm font-bold text-wuwf-blue-700" href="/listens">
          ← WUWF Listens
        </Link>
        <span className={eyebrow}>Host a session</span>
        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight md:text-5xl">Bring a listening session to your table.</h1>
        <p className="font-serif text-xl leading-snug text-ink-2">
          Invite a few people to talk about something that matters where you live, or open it to anyone. You can ask for a WUWF journalist to join. A person at WUWF reads every request and will write back within a week.
        </p>
      </div>
      <HostForm />
    </section>
  )
}

export const metadata: Metadata = {
  title: 'Host a listening session',
  description: 'Ask to bring a WUWF listening session to your table, by invitation or open to the public.',
}
