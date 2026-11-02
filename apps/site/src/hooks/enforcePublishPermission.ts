import type { CollectionBeforeChangeHook } from 'payload'

import { APIError } from 'payload'

import { userCan } from '@/access/permissions'
import { resultsInPublished } from '@/lib/publish-guard'

/**
 * Only staff with content.publish can make a story or page live (publish it, or save an edit to one that already
 * is). Editors save drafts. Runs only for a signed-in user: scripts and the Local API without a user (import,
 * seed) are trusted code and already past access control.
 */
export const enforcePublishPermission: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  if (!req.user) return data
  if (operation !== 'create' && operation !== 'update') return data
  if (!resultsInPublished({ operation, data, originalDoc })) return data
  if (userCan(req.user as { roles?: string[] }, 'content.publish')) return data
  throw new APIError('You can save drafts, but only a publisher can publish.', 403, undefined, true)
}
