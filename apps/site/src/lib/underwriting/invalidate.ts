// Which public pages show an acknowledgment that a change just affected. Pages are pre-rendered and the starter
// refreshes them by path, so an agreement or collection edit has to name the story and hub pages it reaches;
// a cache tag alone would not refresh an already-built article.

import type { Payload } from 'payload'

export type FundableSlug = 'fellowships' | 'series' | 'productions'

const FUNDABLE: readonly FundableSlug[] = ['fellowships', 'series', 'productions']
const HUB_PREFIX: Record<FundableSlug, string> = { fellowships: '/fellowships', series: '/series', productions: '/productions' }
/** The field on a post that points at each kind of funded collection. */
const POST_FIELD: Record<FundableSlug, 'fellowship' | 'series' | 'production'> = {
  fellowships: 'fellowship',
  series: 'series',
  productions: 'production',
}

export const postPath = (slug: string): string => `/posts/${slug}`
export const hubPath = (collection: FundableSlug, slug: string): string => `${HUB_PREFIX[collection]}/${slug}`

/** Sorted and de-duplicated, so the same change always revalidates the same list. */
export function uniquePaths(...lists: readonly string[][]): string[] {
  return [...new Set(lists.flat())].sort()
}

/** The story pages and the hub page of one funded collection. */
export async function pathsAffectedByCollection(payload: Payload, collection: FundableSlug, id: string | number): Promise<string[]> {
  const [hub, posts] = await Promise.all([
    payload.findByID({ collection, id, depth: 0, select: { slug: true }, overrideAccess: true }).catch(() => null),
    payload.find({
      collection: 'posts',
      where: { [POST_FIELD[collection]]: { equals: id } },
      select: { slug: true },
      limit: 1000,
      pagination: false,
      depth: 0,
      draft: false,
      overrideAccess: true,
    }),
  ])
  return uniquePaths(
    posts.docs.map((p) => postPath(p.slug as string)).filter((p) => p !== '/posts/undefined'),
    hub?.slug ? [hubPath(collection, hub.slug as string)] : [],
  )
}

/** Every page reached through the funded collections that carry this agreement. */
export async function pathsAffectedByAgreement(payload: Payload, agreementId: string | number): Promise<string[]> {
  const perKind = await Promise.all(
    FUNDABLE.map(async (collection) => {
      const carrying = await payload.find({
        collection,
        where: { agreements: { equals: agreementId } },
        select: { slug: true },
        limit: 500,
        pagination: false,
        depth: 0,
        overrideAccess: true,
      })
      return Promise.all(carrying.docs.map((doc) => pathsAffectedByCollection(payload, collection, doc.id)))
    }),
  )
  return uniquePaths(...perKind.flat())
}
