import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Page, Post } from '@/payload-types'

export type Resolved = { kind: 'post'; doc: Post } | { kind: 'page'; doc: Page }

/**
 * The one lookup behind the catch-all route: a path to the story or page that owns it. A path is unique across both
 * collections (enforced when a path is saved), so the order here does not matter. `draft` is true only for an
 * authorised preview; a visitor reads published records only.
 */
export async function resolvePath(path: string, draft: boolean): Promise<Resolved | null> {
  const payload = await getPayload({ config: configPromise })

  const posts = await payload.find({
    collection: 'posts',
    depth: 1,
    draft,
    limit: 1,
    overrideAccess: draft,
    pagination: false,
    where: { path: { equals: path } },
  })
  if (posts.docs[0]) return { kind: 'post', doc: posts.docs[0] }

  const pages = await payload.find({
    collection: 'pages',
    draft,
    limit: 1,
    overrideAccess: draft,
    pagination: false,
    where: { path: { equals: path } },
  })
  if (pages.docs[0]) return { kind: 'page', doc: pages.docs[0] }
  return null
}

/** The home page: the page whose slug is `home` (it has no path; "/" is its address). */
export async function resolveHome(draft: boolean): Promise<Page | null> {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'pages',
    draft,
    limit: 1,
    overrideAccess: draft,
    pagination: false,
    where: { slug: { equals: 'home' } },
  })
  return result.docs[0] ?? null
}

/** A record that has no path yet, for the preview of a draft that was never published. Authorised previews only. */
export async function resolveDraftById(collection: 'posts' | 'pages', id: string): Promise<Resolved | null> {
  const payload = await getPayload({ config: configPromise })
  const doc = await payload
    .findByID({ collection, id, depth: collection === 'posts' ? 1 : 2, draft: true, overrideAccess: true })
    .catch(() => null)
  if (!doc) return null
  return collection === 'posts' ? { kind: 'post', doc: doc as Post } : { kind: 'page', doc: doc as Page }
}
