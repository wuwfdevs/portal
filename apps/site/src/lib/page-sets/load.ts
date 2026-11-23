import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import { cacheGeneration } from '@/utilities/getGlobals'

import { setNavTag, type SetNavPage } from './nav'
import type { PageSetId } from './registry'

export interface SetNavData {
  pages: SetNavPage[]
  /** The address of the show the strip belongs to, for its home page (which has none of its own). */
  showPath: string | null
}

/**
 * The published pages of a set, for its strip. For a set whose pages belong to shows (`perShow`) only the pages that name the same show, so one show's strip never lists another's.
 * Read as the public (`overrideAccess: false`, published only), through the data cache under the set's tag, so the page holding the strip is refreshed when a page in the set is
 * saved (`revalidatePage`). Only what the strip needs is kept: a page's name, address and order, and the sections that asked for a link (never their words).
 */
export const loadSetNavPages = (set: PageSetId, showId?: number | string | null) =>
  unstable_cache(
    async (): Promise<SetNavData> => {
      const payload = await getPayload({ config: configPromise })
      const res = await payload.find({
        collection: 'pages',
        where: showId !== null && showId !== undefined ? { and: [{ pageSet: { equals: set } }, { show: { equals: showId } }] } : { pageSet: { equals: set } },
        draft: false,
        depth: 0,
        limit: 50,
        pagination: false,
        overrideAccess: false,
        select: { title: true, path: true, navLabel: true, navOrder: true, noindex: true, navHidden: true, isShowHome: true, sections: true },
      })
      const show =
        showId !== null && showId !== undefined
          ? await payload.findByID({ collection: 'productions', id: showId, depth: 0, overrideAccess: false, select: { path: true } }).catch(() => null)
          : null
      return {
        pages: res.docs.map((d) => ({
          title: d.title,
          path: d.path,
          navLabel: d.navLabel,
          navOrder: d.navOrder,
          noindex: d.noindex,
          navHidden: d.navHidden,
          isShowHome: d.isShowHome,
          sections: ((d.sections ?? []) as Array<{ anchor?: string | null; navLabel?: string | null; navHref?: string | null; hidden?: boolean | null }>).map((s) => ({ anchor: s?.anchor, navLabel: s?.navLabel, navHref: s?.navHref, hidden: s?.hidden })),
        })),
        showPath: typeof show?.path === 'string' ? show.path : null,
      }
    },
    ['page-set-nav', set, String(showId ?? 'all'), cacheGeneration()],
    { tags: [setNavTag(set)], revalidate: 3600 },
  )
