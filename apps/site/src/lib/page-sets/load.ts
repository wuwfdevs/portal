import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import { cacheGeneration } from '@/utilities/getGlobals'

import { setNavTag, type SetNavPage } from './nav'
import type { PageSetId } from './registry'

/**
 * The published pages of a set, for its sub-navigation. Read as the public (`overrideAccess: false`, published only), through the data
 * cache under the set's tag, so the page holding the navigation is refreshed when a page in the set is saved (`revalidatePage`).
 */
export const loadSetNavPages = (set: PageSetId) =>
  unstable_cache(
    async (): Promise<SetNavPage[]> => {
      const payload = await getPayload({ config: configPromise })
      const res = await payload.find({
        collection: 'pages',
        where: { pageSet: { equals: set } },
        draft: false,
        depth: 0,
        limit: 50,
        pagination: false,
        overrideAccess: false,
        select: { title: true, path: true, navLabel: true, navOrder: true },
      })
      return res.docs.map((d) => ({ title: d.title, path: d.path, navLabel: d.navLabel, navOrder: d.navOrder }))
    },
    ['page-set-nav', set, cacheGeneration()],
    { tags: [setNavTag(set)], revalidate: 3600 },
  )
