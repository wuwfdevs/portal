import type { Access, CollectionConfig } from 'payload'

import { requirePermission, userCan } from '../../access/permissions'
import { bodyEditor } from '../../fields/bodyEditor'
import { restrictedBlocksGuard } from '../../hooks/restrictedBlocksGuard'
import { ensureAnchor, markEdited, revalidateUpdate, revalidateUpdateDelete } from './hooks'

/**
 * The public sees an update only while its blog is published; staff who can write content see every one. (A relationship
 * query is used so an update can never be read out from under an unpublished blog.)
 */
const readable: Access = ({ req }) => {
  if (userCan(req.user as { roles?: string[] } | null, 'content.write')) return true
  return { 'livePost._status': { equals: 'published' } }
}

/**
 * One timestamped update in a live blog. Posting one is one save and it is live at once: an editor does it in an emergency
 * and should not wait for a publisher (owner decision, 2026-11-03: editors post updates; publishers open and end the blog).
 * Updates are their own records so a burst of them never contends for one document or fills the blog's version history.
 */
export const LiveUpdates: CollectionConfig = {
  slug: 'live-updates',
  labels: { singular: 'Live update', plural: 'Live updates' },
  access: {
    read: readable,
    create: requirePermission('content.write'),
    update: requirePermission('content.write'),
    delete: requirePermission('content.write'),
  },
  admin: {
    // Updates are posted from inside their blog (its "Updates" list); this stays reachable by address but has no sidebar link.
    group: false,
    useAsTitle: 'headline',
    defaultColumns: ['headline', 'livePost', 'postedAt'],
    listSearchableFields: ['headline'],
    description: 'Post an update to a live blog. It is live as soon as you save.',
  },
  defaultSort: '-postedAt',
  fields: [
    { name: 'livePost', type: 'relationship', relationTo: 'posts', required: true, index: true, label: 'Live blog', filterOptions: { format: { equals: 'live' } } },
    { name: 'headline', type: 'text', required: true },
    { name: 'body', type: 'richText', editor: bodyEditor, required: true, label: 'Update' },
    {
      name: 'postedAt',
      type: 'date',
      required: true,
      index: true,
      defaultValue: () => new Date().toISOString(),
      admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'When this happened or was posted. Defaults to now.' },
    },
    { name: 'editedAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' }, description: 'Set automatically when the words are changed after posting; readers see "Updated".' } },
    { name: 'authors', type: 'relationship', relationTo: 'contributors', hasMany: true, admin: { description: 'Optional. Leave empty and the update carries no byline.' } },
    {
      name: 'anchor',
      type: 'text',
      index: true,
      admin: { position: 'sidebar', description: 'The part of the address after # that links straight to this update. Made from the headline; it never changes by itself.' },
    },
    {
      name: 'legacy',
      type: 'group',
      label: 'From Grove',
      admin: { position: 'sidebar', description: 'Set by the migration. Leave empty for new work.' },
      fields: [{ name: 'postId', type: 'text', unique: true, index: true, access: { update: () => false }, admin: { description: 'Grove\'s id for this update. Fixed once set; a re-run matches on it.' } }],
    },
  ],
  hooks: {
    beforeValidate: [ensureAnchor],
    beforeChange: [restrictedBlocksGuard(['body']), markEdited],
    afterChange: [revalidateUpdate],
    afterDelete: [revalidateUpdateDelete],
  },
}
