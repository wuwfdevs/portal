import type { CollectionBeforeChangeHook } from 'payload'

import { APIError, ValidationError } from 'payload'

import { userCan } from '../access/permissions'
import { checkPath } from '../lib/paths'
import { pathTaken } from './pathHooks'

const blank = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/**
 * A show's address. A migrated show keeps Grove's exact one (`/show/classical-24`); a new one gets `/shows/<slug>` when it is
 * created and then keeps it. Only a publisher can set or change it (the importer and scripts, with no signed-in user, may),
 * and it cannot collide with a story's, a page's or another show's.
 */
export const showPathBeforeChange: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (operation !== 'create' && operation !== 'update') return data
  const existing = blank(originalDoc?.path)
  const touched = data.path !== undefined
  let path = touched ? blank(data.path) : existing

  if (touched && path !== existing && req.user && !userCan(req.user as { roles?: string[] }, 'content.publish')) {
    throw new APIError('Only a publisher can set or change an address.', 403, undefined, true)
  }
  const slug = (data.slug ?? originalDoc?.slug) as string | undefined
  if (!path && slug) path = `/shows/${slug}`

  if (path && path !== existing) {
    const check = checkPath(path)
    const fail = (message: string): never => {
      throw new ValidationError({ collection: 'productions', errors: [{ message, path: 'path' }], req }, req.t)
    }
    if (!check.ok) fail(check.reason)
    const id = originalDoc?.id as string | number | undefined
    if (await pathTaken(req.payload, req, path, id !== undefined ? { collection: 'productions', id } : undefined)) fail(`The address ${path} is already used by another show, page or story.`)
  }
  if (path) data.path = path
  return data
}
