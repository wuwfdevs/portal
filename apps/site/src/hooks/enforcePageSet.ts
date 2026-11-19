import type { CollectionBeforeChangeHook } from 'payload'
import { APIError } from 'payload'

import { canEditSet, canPublishSet } from '@/lib/page-sets/registry'
import { resultsInPublished } from '@/lib/publish-guard'

type User = { roles?: string[] }

/**
 * A page's set decides who may edit it (and who may publish it). Runs for a signed-in user only (a script or the Local API without a
 * user is trusted code). Both the set the page is in and the set it is being moved to must be one the user may edit, so an editor cannot
 * move a page into the sponsor set or take one out of it. Replaces `enforcePublishPermission` on pages: a publisher can publish anywhere,
 * and membership staff can publish giving pages.
 */
export const enforcePageSet: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  if (!req.user) return data
  if (operation !== 'create' && operation !== 'update') return data
  const user = req.user as User
  const before = operation === 'update' ? (originalDoc?.pageSet ?? null) : null
  const after = data?.pageSet !== undefined ? (data.pageSet ?? null) : before
  if (operation === 'update' && !canEditSet(user, before)) throw new APIError('Your role cannot edit pages in this page set.', 403, undefined, true)
  if (!canEditSet(user, after)) throw new APIError('Your role cannot put a page in this page set.', 403, undefined, true)
  if (resultsInPublished({ operation, data, originalDoc }) && !canPublishSet(user, after)) {
    throw new APIError('You can save drafts, but only a publisher can publish.', 403, undefined, true)
  }
  return data
}
