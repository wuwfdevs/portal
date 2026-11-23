// The server read behind "Play the latest": a show's newest published episode that has audio the public may play. Through the Local API with access control on, cached with
// `unstable_cache` under its own window. Imported only when the control draws (the block registry is read by the Payload config, which this loads).

import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import type { Audio } from '@/payload-types'
import { trackFromAudio, type Track } from '@/lib/player/track'

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
