import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, Payload, PayloadRequest, Where } from 'payload'

import { APIError, ValidationError } from 'payload'

import { userCan } from '../access/permissions'
import { checkPath, pagePath, storyPath } from '../lib/paths'

/** The collections whose records are served by path (a production is a show). One registry, so the resolver and the uniqueness check agree. */
export const PATH_COLLECTIONS = ['posts', 'pages', 'productions', 'events'] as const
export type PathCollection = (typeof PATH_COLLECTIONS)[number]

const blank = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

const idOf = (ref: unknown): string | number | null => {
  if (ref && typeof ref === 'object' && 'id' in ref) return (ref as { id: string | number }).id
  return typeof ref === 'string' || typeof ref === 'number' ? ref : null
}

function invalid(collection: string, req: PayloadRequest, path: string, message: string): never {
  throw new ValidationError({ collection, errors: [{ message, path }], req }, req.t)
}

/** Whether any record in any path collection other than `self` already has this path. */
export async function pathTaken(payload: Payload, req: PayloadRequest, path: string, self?: { collection: PathCollection; id: string | number }): Promise<boolean> {
  for (const collection of PATH_COLLECTIONS) {
    const where: Where =
      self && self.collection === collection
        ? { and: [{ path: { equals: path } }, { id: { not_equals: self.id } }] }
        : { path: { equals: path } }
    const found = await payload.count({ collection, where, overrideAccess: true, req })
    if (found.totalDocs > 0) return true
  }
  return false
}

/**
 * Runs after `enforcePublishPermission`. Three jobs:
 *  1. only a publisher may set or change a path (a script or the importer, with no signed-in user, may);
 *  2. a record being published with no path gets one, once (stories: section + date + slug; pages: /slug);
 *  3. whatever path ends up stored is valid and not used by any other page or story.
 */
export const pathBeforeChange =
  (kind: PathCollection): CollectionBeforeChangeHook =>
  async ({ data, originalDoc, req, operation }) => {
    if (operation !== 'create' && operation !== 'update') return data
    const existing = blank(originalDoc?.path)
    const touched = data.path !== undefined
    let path = touched ? blank(data.path) : existing

    if (touched && path !== existing && req.user && !userCan(req.user as { roles?: string[] }, 'content.publish')) {
      throw new APIError('Only a publisher can set or change an address.', 403, undefined, true)
    }

    const status = data._status ?? originalDoc?._status
    const slug = (data.slug ?? originalDoc?.slug) as string | undefined

    if (!path && status === 'published' && !(kind === 'pages' && slug === 'home')) {
      if (kind === 'pages') {
        if (!slug) invalid(kind, req, 'slug', 'A page needs an address name before it is published.')
        path = pagePath(slug)
      } else {
        const sectionId = idOf(data.section ?? originalDoc?.section)
        if (sectionId === null) invalid(kind, req, 'section', 'Choose a section before publishing: the story\'s address is built from it and then fixed.')
        if (!slug) invalid(kind, req, 'slug', 'A story needs an address name before it is published.')
        const section = await req.payload.findByID({ collection: 'sections', id: sectionId, depth: 0, overrideAccess: true, req })
        const publishedAt: string = (data.publishedAt ?? originalDoc?.publishedAt ?? new Date().toISOString()) as string
        data.publishedAt = publishedAt // the date in the address and the published date must be the same moment
        path = storyPath({ section: section.slug as string, publishedAt, slug })
      }
    }

    if (path && path !== existing) {
      const check = checkPath(path)
      if (!check.ok) invalid(kind, req, 'path', check.reason)
      const id = originalDoc?.id as string | number | undefined
      if (await pathTaken(req.payload, req, path, id !== undefined ? { collection: kind, id } : undefined)) {
        invalid(kind, req, 'path', `The address ${path} is already used by another page or story.`)
      }
    }

    if (path) data.path = path
    else if (touched) data.path = null
    return data
  }

/**
 * A live record whose address changes leaves a redirect from the old one to the new, so nothing that was linked
 * to or indexed breaks. Redirects that already pointed at the old address are repointed (no chains), and one that
 * sat on the new address is removed (no loop). A record that was never published had no public address to keep.
 */
export const redirectOnPathChange: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (operation !== 'update') return doc
  const from = blank(previousDoc?.path)
  const to = blank(doc?.path)
  if (!from || !to || from === to || previousDoc?._status !== 'published') return doc

  const { payload } = req
  const redirect = { overrideAccess: true, req } as const

  const onNewAddress = await payload.find({ collection: 'redirects', where: { from: { equals: to } }, limit: 10, pagination: false, depth: 0, ...redirect })
  for (const r of onNewAddress.docs) await payload.delete({ collection: 'redirects', id: r.id, ...redirect })

  const pointingAtOld = await payload.find({ collection: 'redirects', where: { 'to.url': { equals: from } }, limit: 1000, pagination: false, depth: 0, ...redirect })
  for (const r of pointingAtOld.docs) {
    await payload.update({ collection: 'redirects', id: r.id, data: { to: { type: 'custom', url: to } }, ...redirect })
  }

  const existing = await payload.find({ collection: 'redirects', where: { from: { equals: from } }, limit: 1, pagination: false, depth: 0, ...redirect })
  const data = { from, to: { type: 'custom' as const, url: to } }
  if (existing.docs[0]) await payload.update({ collection: 'redirects', id: existing.docs[0].id, data, ...redirect })
  else await payload.create({ collection: 'redirects', data, ...redirect })
  return doc
}

/**
 * Where a record came from in Grove (its path and its contentId) is provenance: set by the migration, then fixed. The
 * live address is `path`, which a publisher may change with a redirect; these two are what a re-run matches against.
 * A script or the importer, with no signed-in user, may still set them.
 */
export const legacyIdentityWriteOnce: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!req.user) return data
  for (const field of ['legacyPath', 'groveId'] as const) {
    const before = blank(originalDoc?.legacy?.[field])
    const next = data?.legacy?.[field]
    if (before && next !== undefined && blank(next) !== before) {
      throw new APIError(
        field === 'legacyPath'
          ? 'The Grove path is fixed once set. To move the live address, change the address field.'
          : 'The Grove id is fixed once set.',
        403,
        undefined,
        true,
      )
    }
  }
  return data
}
