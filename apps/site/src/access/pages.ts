import type { Access, Where } from 'payload'

import { PAGE_SET_IDS, canEditSet, editableSets } from '@/lib/page-sets/registry'

import { userCan } from './permissions'

type WithRoles = { roles?: readonly string[] | null } | null | undefined

/**
 * Who may do what to a page depends on its page set (PAGE-BLOCKS.md → Page sets; `lib/page-sets/registry.ts` names the permission each set
 * needs). Pages in no set need `content.write`; the sponsor set needs `content.publish`; the giving set needs `membership.manage` or
 * `content.publish`; the other sets need `content.write`.
 */

/** Create: anyone who may edit some set. Which set the new page is in is checked by `enforcePageSet` (the admin asks this without data). */
export const pagesCreate: Access = ({ req }) => {
  const { sets, noSet } = editableSets(req.user as WithRoles)
  return noSet || sets.length > 0
}

/** Update: narrowed to the sets this staff member may edit. */
export const pagesUpdate: Access = ({ req }) => {
  const { sets, noSet } = editableSets(req.user as WithRoles)
  if (noSet && sets.length === PAGE_SET_IDS.length) return true
  const or: Where[] = []
  if (sets.length > 0) or.push({ pageSet: { in: sets } })
  if (noSet) or.push({ pageSet: { exists: false } })
  return or.length > 0 ? { or } : false
}

/**
 * Read: the public reads published pages; content staff read everything (drafts for review and preview); membership staff also read the
 * giving pages they edit, drafts included.
 */
export const pagesRead: Access = ({ req }) => {
  const user = req.user as WithRoles
  if (userCan(user, 'content.write')) return true
  const published: Where = { _status: { equals: 'published' } }
  if (canEditSet(user, 'giving')) return { or: [published, { pageSet: { equals: 'giving' } }] }
  return published
}
