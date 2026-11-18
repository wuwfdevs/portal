import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Media } from '@/payload-types'

import { placementTiles, type PlacementTile } from './tiles'

export interface HomePlacements {
  rail: PlacementTile<Media>[]
  band: PlacementTile<Media> | null
}

const NONE: HomePlacements = { rail: [], band: null }

/**
 * What fills the home page's rail and banner today. Read through access control (`overrideAccess: false`), and never allowed to take the page
 * down: if the read fails, the placements are left out and the news is unaffected (the site stays usable when sponsorship serving is down).
 */
export async function loadHomePlacements(now: Date = new Date()): Promise<HomePlacements> {
  let payload: Awaited<ReturnType<typeof getPayload>> | null = null
  try {
    payload = await getPayload({ config: configPromise })
    const global = await payload.findGlobal({ slug: 'placements', depth: 1, overrideAccess: false })
    return {
      rail: placementTiles<Media>('home.rail', global.homeRail, now),
      band: placementTiles<Media>('home.band', global.homeBand, now)[0] ?? null,
    }
  } catch (err) {
    payload?.logger.error({ err, msg: 'Home page: the sponsor and promo placements could not be loaded and are left out' })
    return NONE
  }
}
