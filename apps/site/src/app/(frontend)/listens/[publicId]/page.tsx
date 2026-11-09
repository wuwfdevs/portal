import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React, { cache } from 'react'

import { PolicyNotice } from '@/components/Account/PolicyNotice'
import { QuestionSet } from '@/components/Listening/QuestionSet'
import { eyebrow } from '@/components/Listening/styles'
import { availabilityMessage } from '@/lib/listening/flow'
import { loadQuery } from '@/lib/listening/load'
import { LISTENING_NOT_SET_UP } from '@/lib/listening/messages'
import { isPublicId } from '@/lib/listening/results'

export const dynamic = 'force-dynamic'

// One read per request, whether the page or its metadata asks first.
const load = cache(loadQuery)

type Params = { publicId: string }

export default async function QuestionSetPage({ params }: { params: Promise<Params> }) {
  const { publicId } = await params
  if (!isPublicId(publicId)) notFound()

  const loaded = await load(publicId)
  // A draft and an unknown address answer the same way, so a draft cannot be probed for.
  if (loaded.kind === 'not_available') notFound()

  if (loaded.kind !== 'ok') {
    return (
      <section className="container py-16">
        <p className="max-w-2xl text-lg text-ink-2">
          {loaded.kind === 'not_set_up' ? LISTENING_NOT_SET_UP : "We couldn't load this question just now. Try again in a moment."}
        </p>
      </section>
    )
  }

  const { query } = loaded
  const unavailable = availabilityMessage(query.state, query.opensAt)
  const byline = [query.contextLabel, query.askedBy ? `asked by ${query.askedBy}` : query.fromLabel].filter(Boolean).join(' · ')

  return (
    <section className="bg-surface-2 py-8 md:py-12">
      <div className="container flex flex-col gap-5">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3">
          <Link className="text-sm font-bold" href="/listens">
            ← WUWF Listens
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-xl flex-col gap-1">
          <span className={eyebrow}>Help us report{byline ? ` · ${byline}` : ''}</span>
        </div>
        {unavailable || query.questions.length === 0 ? (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-md border border-rule bg-surface p-8 shadow-2">
            <h1 className="font-serif text-[1.375rem] font-bold">{query.title}</h1>
            <p className="text-base text-ink-2">{unavailable ?? 'This question has nothing to answer yet.'}</p>
            <Link className="font-bold" href="/listens">
              See what is open now
            </Link>
            <PolicyNotice />
          </div>
        ) : (
          <QuestionSet query={query} />
        )}
      </div>
    </section>
  )
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { publicId } = await params
  if (!isPublicId(publicId)) return { title: 'WUWF Listens' }
  const loaded = await load(publicId)
  return { title: loaded.kind === 'ok' ? `${loaded.query.title} · WUWF Listens` : 'WUWF Listens' }
}
