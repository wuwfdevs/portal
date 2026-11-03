import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionBeforeChangeHook, CollectionBeforeValidateHook } from 'payload'

import { APIError } from 'payload'

import { uniqueAnchor, isValidAnchor } from '@/lib/live/anchor'
import { wordsChanged } from '@/lib/live/edit'
import { livePath } from '@/lib/paths'
import { revalidatePath, revalidateTag } from '@/lib/revalidate'

const idOf = (ref: unknown): string | number | null => {
  if (ref && typeof ref === 'object' && 'id' in ref) return (ref as { id: string | number }).id
  return typeof ref === 'string' || typeof ref === 'number' ? ref : null
}

// ---- the blog ------------------------------------------------------------------------------------------------------
// A live blog is a story (a post with format "live"); its page, lists and caches are handled by the post's own hooks. Only the
// bit that is specific to live blogs is here.

/** Ending a blog stamps when, once; reopening it clears that. A script or the importer may set `endedAt` itself. */
export const stampEnd: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (!data || (data.format ?? originalDoc?.format) !== 'live') return data
  const live = (data.live ?? {}) as { coverage?: string; endedAt?: string | null }
  const before = (originalDoc?.live ?? {}) as { coverage?: string; endedAt?: string | null }
  const coverage = live.coverage ?? before.coverage
  const endedAt = live.endedAt !== undefined ? live.endedAt : before.endedAt
  if (coverage === 'ended' && !endedAt) return { ...data, live: { ...live, endedAt: new Date().toISOString() } }
  if (coverage === 'live' && endedAt) return { ...data, live: { ...live, endedAt: null } }
  return data
}

// ---- one update ----------------------------------------------------------------------------------------------------

/** Gives a new update an anchor from its headline; keeps one it already has; refuses a duplicate within the blog. */
export const ensureAnchor: CollectionBeforeValidateHook = async ({ data, originalDoc, req, operation }) => {
  if (!data) return data
  const blogId = idOf(data.livePost) ?? idOf(originalDoc?.livePost)
  const given = typeof data.anchor === 'string' ? data.anchor.trim() : ''
  const existing = typeof originalDoc?.anchor === 'string' ? originalDoc.anchor : ''
  // An anchor is a link someone may have shared: once set it never changes by itself.
  const anchor = given || existing
  if (anchor && !isValidAnchor(anchor)) throw new APIError('The anchor may use lower-case letters, digits and hyphens only.', 400, undefined, true)
  if (blogId === null) return data

  const others = await req.payload.find({
    collection: 'live-updates',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    pagination: false,
    req,
    select: { anchor: true },
    where: operation === 'update' && originalDoc?.id ? { and: [{ livePost: { equals: blogId } }, { id: { not_equals: originalDoc.id } }] } : { livePost: { equals: blogId } },
  })
  const taken = new Set(others.docs.map((d) => d.anchor).filter((a): a is string => typeof a === 'string'))
  if (anchor) {
    if (taken.has(anchor)) throw new APIError(`Another update in this blog already uses the anchor "${anchor}".`, 400, undefined, true)
    return { ...data, anchor }
  }
  return { ...data, anchor: uniqueAnchor(typeof data.headline === 'string' ? data.headline : 'update', taken) }
}

/** An update whose words change after it was posted gets an edited time (a person's edit only; the importer sets its own). */
export const markEdited: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  if (operation !== 'update' || !req.user || !originalDoc) return data
  // On an update `data` carries the stored values too; only an edited time that differs from the stored one was set on purpose.
  if (data?.editedAt !== undefined && data.editedAt !== (originalDoc.editedAt ?? null)) return data
  return wordsChanged(originalDoc, { headline: data?.headline, body: data?.body }) ? { ...data, editedAt: new Date().toISOString() } : data
}

/** Publishing an update must show on the page at once: it refreshes the blog's page, the front page and the status feed. */
export const revalidateUpdate: CollectionAfterChangeHook = async ({ doc, req: { payload, context } }) => {
  if (context.disableRevalidate) return doc
  const blogId = idOf(doc.livePost)
  if (blogId === null) return doc
  const blog = await payload.findByID({ collection: 'posts', id: blogId, depth: 0, overrideAccess: true, select: { slug: true } }).catch(() => null)
  if (blog?.slug) {
    revalidatePath(livePath(blog.slug))
    revalidateTag(`live:${blog.slug}`, 'max')
  }
  revalidatePath('/')
  return doc
}
export const revalidateUpdateDelete: CollectionAfterDeleteHook = async ({ doc, req: { payload, context } }) => {
  if (context.disableRevalidate) return doc
  const blogId = idOf(doc?.livePost)
  const blog = blogId === null ? null : await payload.findByID({ collection: 'posts', id: blogId, depth: 0, overrideAccess: true, select: { slug: true } }).catch(() => null)
  if (blog?.slug) {
    revalidatePath(livePath(blog.slug))
    revalidateTag(`live:${blog.slug}`, 'max')
  }
  return doc
}
