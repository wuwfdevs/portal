// The server read behind the Explore block: a show's published episodes and the sites they are about, shaped (`shape.ts`) into plain JSON. Through Payload's Local API with access control
// on (`overrideAccess: false`, published only), cached with `unstable_cache` under its own tag and window (the page holding the block is cached for no longer than the window, and no other
// page is affected). A read that fails throws out of the cache and is never cached. The block imports this only when it draws: the registry is read by the Payload config, which this loads.

import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import { shapeExplore, type ExploreData } from './shape'

/** How long a read is kept, in seconds. A saved site refreshes it at once through the `explore` tag. */
export const EXPLORE_REVALIDATE = 300
/** Far more than the show has; a show that outgrows it should page, not silently cut. */
const MAX_EPISODES = 2000
const MAX_SITES = 1000

const read = async (showId: number | string): Promise<ExploreData> => {
  const payload = await getPayload({ config: configPromise })
  const [sites, episodes] = await Promise.all([
    payload.find({ collection: 'sites', depth: 0, limit: MAX_SITES, overrideAccess: false, pagination: false, sort: 'name', select: { name: true, place: true, era: true, description: true, latitude: true, longitude: true } }),
    payload.find({
      collection: 'posts',
      depth: 0,
      draft: false,
      limit: MAX_EPISODES,
      overrideAccess: false,
      pagination: false,
      sort: '-publishedAt',
      select: { title: true, path: true, site: true, period: true, yearStart: true, yearEnd: true },
      where: { and: [{ production: { equals: showId } }, { format: { equals: 'audio' } }, { site: { exists: true } }] },
    }),
  ])
  return shapeExplore(sites.docs, episodes.docs)
}

const cached = unstable_cache(read, ['explore'], { revalidate: EXPLORE_REVALIDATE, tags: ['section-data', 'explore'] })

/** The sites a show has episodes at, with those episodes. Empty when the show has none. */
export const loadExplore = (showId: number | string): Promise<ExploreData> => cached(showId)
