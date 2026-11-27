import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React, { cache, Suspense } from 'react'

import { GatherChoice } from '@/components/Listening/GatherChoice'
import { loadQuery } from '@/lib/listening/load'
import { LISTENING_NOT_SET_UP } from '@/lib/listening/messages'
import { isPublicId } from '@/lib/listening/results'
import { gatherMode, gatherOptions } from '@/lib/listening/talk'

export const dynamic = 'force-dynamic'

const load = cache(loadQuery)

type Params = { publicId: string }

/**
 * Gather people around a question. One page for both ways (a private table now, or a request WUWF schedules): the reader chooses only when the
 * question allows both, and the question decides what is offered, so a question that allows neither has no such page.
 */
export default async function GatherPage({ params }: { params: Promise<Params> }) {
  const { publicId } = await params
  if (!isPublicId(publicId)) notFound()

  const loaded = await load(publicId)
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
  const mode = gatherMode(gatherOptions(query))
  if (mode === 'none' || query.state !== 'open') notFound()

  return (
    <section className="bg-surface py-8 md:py-12">
      <div className="container flex max-w-3xl flex-col gap-8" style={{ marginLeft: 0 }}>
        <div className="flex flex-col gap-3">
          <Link className="text-sm font-bold" href={`/listens/${query.publicId}`}>
            ← {query.title}
          </Link>
          <h1 className="font-serif text-4xl font-semibold leading-tight">Gather people around this question</h1>
          {mode === 'choose' && <p className="font-serif text-xl text-ink-2">How do you want to gather?</p>}
        </div>
        <Suspense>
          <GatherChoice mode={mode} query={{ publicId: query.publicId, title: query.title }} />
        </Suspense>
      </div>
    </section>
  )
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { publicId } = await params
  if (!isPublicId(publicId)) return { title: 'WUWF Listens' }
  const loaded = await load(publicId)
  return { title: loaded.kind === 'ok' ? `Gather people · ${loaded.query.title} · WUWF Listens` : 'WUWF Listens' }
}
