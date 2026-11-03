import type { CollectionBeforeChangeHook } from 'payload'

import { APIError } from 'payload'

import { userCan } from '@/access/permissions'
import { changedLegacyHtml, changedWidgets } from '@/lib/legacy-html-guard'

/**
 * Two blocks in the story body editor are restricted: preserved (migrated) HTML is administrator-only, and a script widget
 * is publisher-only (it decides which site's code a reader runs). Payload does not apply a block's field-level access to a
 * block nested in rich text, so the restriction has to be a collection hook that compares what is being saved with what is
 * stored. Put this on EVERY collection that has a rich-text field using `bodyEditor`, naming those fields.
 *
 * Someone who merely re-saves keeps the blocks already there. A save with no signed-in user is the system (the importer,
 * scripts, tests that seed data) and is allowed.
 */
export const restrictedBlocksGuard =
  (fields: readonly string[]): CollectionBeforeChangeHook =>
  ({ data, originalDoc, req }) => {
    if (!req.user) return data
    const user = req.user as { roles?: string[] }
    for (const field of fields) {
      if (data?.[field] === undefined) continue
      if (!userCan(user, 'settings.manage') && changedLegacyHtml(data[field], originalDoc?.[field]).length > 0) {
        throw new APIError('Only an administrator can add or change preserved HTML.', 403, undefined, true)
      }
      if (!userCan(user, 'content.publish') && changedWidgets(data[field], originalDoc?.[field]).length > 0) {
        throw new APIError('Only a publisher can add a script widget or change its script or settings.', 403, undefined, true)
      }
    }
    return data
  }
