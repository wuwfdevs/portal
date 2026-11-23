import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import { SECTION_REVALIDATE, sectionClock } from '@/lib/section-data/load'
import { artistListItem } from '@/lib/section-data/shape'

import { indexArtists } from './artist-index'
import type { ArtistIndexEntry } from '@/blocks/sections/ArtistIndex/Component'

/**
 * Every artist of a published show, A to Z, with their picture and appearances. Read through the Local API with access control on (published shows only), cached with the dates' window
 * (an appearance counts once its show is over) and refreshed when a show or an artist is saved (the tag `radiolive`). A failed read throws and is never cached.
 */
const read = async (nowIso: string): Promise<ArtistIndexEntry[]> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'performances', depth: 2, limit: 1000, pagination: false, sort: '-startsAt', overrideAccess: false, draft: false, where: { _status: { equals: 'published' } } })
  const docs = new Map<string, unknown>()
  const shows = found.docs.map((p) => ({
    slug: p.slug ?? String(p.id),
    startsAt: p.startsAt,
    lineup: (p.lineup ?? []).flatMap((a) => {
      if (typeof a !== 'object' || a === null || !a.slug || !a.name) return []
      if (!docs.has(a.slug)) docs.set(a.slug, a)
      return [{ slug: a.slug, name: a.name }]
    }),
  }))
  return indexArtists(shows, new Date(nowIso)).map((artist) => ({ artist, item: artistListItem(docs.get(artist.slug)) }))
}

const cached = unstable_cache(read, ['radiolive-artist-index'], { revalidate: SECTION_REVALIDATE.dates, tags: ['section-data', 'section-data:list', 'section-data:dates', 'radiolive'] })

export async function loadArtistIndex(): Promise<ArtistIndexEntry[]> {
  return cached(await sectionClock())
}
