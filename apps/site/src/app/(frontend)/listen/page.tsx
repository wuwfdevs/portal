import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import { ListenPanel } from '@/components/ListenLive/ListenPanel'
import { fetchNowNext } from '@/lib/live/cadence'
import { liveChannels } from '@/lib/live/channels'
import type { NowNext } from '@/lib/live/schedule'
import { getCachedGlobal } from '@/utilities/getGlobals'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Listen live',
  description: 'Listen to WUWF live: 88.1, HD2 Classical and HD3, with what is on now and next.',
}

/**
 * Listen live (board 26). The player is the site-wide one (in the layout), so pressing play here keeps playing on every
 * other page. The streams and the "Other ways to listen" cards come from the Listen live settings; "On now" from NPR
 * Cadence through the site's server. Not built yet: the board's week schedule (Cadence's week data is not read yet) and
 * the pop-out player.
 */
export default async function ListenPage() {
  const settings = await getCachedGlobal('listen-live', 0)()
  const channels = liveChannels(settings?.channels)
  if (channels.length === 0) notFound()

  // The first answer is rendered on the server, so "On now" is there before any script runs.
  const initial: Record<string, NowNext> = {}
  await Promise.all(
    channels.map(async (c) => {
      if (c.cadenceChannelId) initial[c.key] = (await fetchNowNext(c.cadenceChannelId)).data
    }),
  )
  const ways = settings?.otherWays ?? []

  return (
    <>
      <section aria-labelledby="listen-title" className="container flex flex-col gap-7 py-12">
        <div className="flex flex-col gap-2.5">
          <span className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">WUWF 88.1 · Pensacola</span>
          <h1 className="font-serif text-4xl font-bold leading-tight text-ink md:text-6xl" id="listen-title">
            Listen live
          </h1>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="min-w-0 lg:flex-[2]">
            <ListenPanel initial={initial} />
          </div>
          <aside className="flex flex-col gap-4 lg:flex-1">
            <div className="flex flex-col gap-2 rounded-md border border-rule bg-surface-2 p-6">
              <h2 className="font-serif text-xl font-bold leading-snug text-ink">Keeps playing while you browse</h2>
              <p className="text-base text-ink-2">Start the stream once and read, watch or give. The player stays at the bottom of every page on wuwf.org.</p>
            </div>
            <div className="flex flex-col gap-2 rounded-md bg-wuwf-blue-100 p-6">
              <h2 className="text-lg font-bold text-ink">Stream not playing?</h2>
              <p className="text-base text-ink-2">
                Check your connection, then press play again. Some work and school networks block audio streams. The same programs play on 88.1 FM.
              </p>
              {ways.length > 0 && (
                <a className="font-bold" href="#ways">
                  Other ways to listen
                </a>
              )}
            </div>
            <div className="flex flex-col gap-2 rounded-md border border-rule p-6">
              <h2 className="text-lg font-bold text-ink">Public radio runs on its listeners</h2>
              <p className="text-base text-ink-2">Listening is free. Giving keeps it that way.</p>
              <Link className="font-bold" href="/support">
                Give now
              </Link>
            </div>
          </aside>
        </div>
      </section>

      {ways.length > 0 && (
        <section aria-labelledby="ways-title" className="container flex flex-col gap-6 pb-14" id="ways">
          <h2 className="font-serif text-3xl font-bold text-ink md:text-4xl" id="ways-title">
            Other ways to listen
          </h2>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ways.map((w) => (
              <li className="flex flex-col gap-2 rounded-md border border-rule p-6" key={w.id ?? w.title}>
                <h3 className="font-serif text-xl font-bold text-ink">{w.title}</h3>
                <p className="text-base text-ink-2">{w.text}</p>
                {w.linkUrl && w.linkLabel && (
                  <a className="font-bold" href={w.linkUrl}>
                    {w.linkLabel}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
