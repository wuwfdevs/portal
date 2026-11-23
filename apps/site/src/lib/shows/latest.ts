// The server read behind "Play the latest": a show's newest published episode that has audio the public may play. Through the Local API with access control on, cached with
// `unstable_cache` under its own window. Imported only when the control draws (the block registry is read by the Payload config, which this loads).

import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import type { Audio } from '@/payload-types'
import { trackFromAudio, type Track } from '@/lib/player/track'
import { leadImageOf } from '@/lib/seo/meta'

/** How many of the newest episodes are looked through for one that can be played. */
const RECENT = 10

const read = async (showId: number | string): Promise<Track | null> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({
    collection: 'posts',
    depth: 1,
    draft: false,
    limit: RECENT,
    overrideAccess: false,
    pagination: false,
    sort: '-publishedAt',
    select: { title: true, path: true, featuredAudio: true },
    // Not filtered by `featuredAudio`: that field has its own read access (a members-only file's address is withheld), and Payload refuses to filter on a field the reader may not read.
    where: { and: [{ production: { equals: showId } }, { format: { equals: 'audio' } }] },
  })
  // The newest episode whose audio the public may play: a members-only episode's audio comes back without its address, so no track is made for it and the next one is tried.
  for (const episode of found.docs) {
    const audio = episode.featuredAudio && typeof episode.featuredAudio === 'object' ? (episode.featuredAudio as Audio) : null
    const track = trackFromAudio(audio, { title: episode.title, href: episode.path })
    if (track) return track
  }
  return null
}

const cached = unstable_cache(read, ['show-latest-track'], { revalidate: 300, tags: ['section-data', 'section-data:list'] })

/** A track for the show's newest playable episode, or null when it has none. */
export const loadLatestTrack = (showId: number | string): Promise<Track | null> => cached(showId)


/**
 * The show's newest published episode, shaped for a Feature's lead (hubs redesign: a show's home leads with what is newest, so the page does not repeat the name the strip already carries).
 * Plain JSON, because it is cached. Unlike "Play the latest" it does not skip an episode that cannot be played: the lead is the newest episode, and `track` is null when its audio is members-only or missing.
 */
export interface LatestEpisode {
  title: string
  /** "Nov 6, 2026", or null when the episode has no publication date. */
  when: string | null
  description: string | null
  /** The episode's own page. */
  href: string
  /** The episode's picture (its share image, else its lead picture), or null. */
  photo: unknown
  track: Track | null
}

const ZONE = 'America/Chicago'
const dateOf = (iso: string | null | undefined): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('en-US', { timeZone: ZONE, month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

const readEpisode = async (showId: number | string): Promise<LatestEpisode | null> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({
    collection: 'posts',
    depth: 1,
    draft: false,
    limit: 1,
    overrideAccess: false,
    pagination: false,
    sort: '-publishedAt',
    select: { title: true, dek: true, path: true, publishedAt: true, meta: true, featuredMedia: true, featuredAudio: true },
    where: { and: [{ production: { equals: showId } }, { format: { equals: 'audio' } }] },
  })
  const episode = found.docs[0]
  // An episode with no address has no page to link to and is not a story the public can open yet.
  if (!episode?.path || !episode.title) return null
  const audio = episode.featuredAudio && typeof episode.featuredAudio === 'object' ? (episode.featuredAudio as Audio) : null
  return {
    title: episode.title,
    when: dateOf(episode.publishedAt),
    description: episode.dek?.trim() || episode.meta?.description?.trim() || null,
    href: episode.path,
    photo: leadImageOf(episode),
    track: trackFromAudio(audio, { title: episode.title, href: episode.path }),
  }
}

const cachedEpisode = unstable_cache(readEpisode, ['show-latest-episode'], { revalidate: 300, tags: ['section-data', 'section-data:list'] })

/** The show's newest published episode, or null when it has none. A failed read throws and is never cached. */
export const loadLatestEpisode = (showId: number | string): Promise<LatestEpisode | null> => cachedEpisode(showId)
