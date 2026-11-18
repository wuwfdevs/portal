import type { CollectionConfig, Field } from 'payload'

import { APIError } from 'payload'

import { requirePermission } from '../../access/permissions'
import { statusChangeAllowed, type NetworkStatus } from '../../lib/network/status'
import { tombstoneFields } from '../../lib/network/tombstone'

/** Fields only the poll writes. System writes skip field access, so these are closed to every staff request, including the API. */
const systemOnly = { create: () => false, update: () => false }

const fromSource = (field: Field & { name: string }): Field => ({ ...field, access: systemOnly, admin: { ...('admin' in field ? field.admin : {}), readOnly: true } }) as Field

/**
 * A story another station or NPR published, as the poll found it: a thin, disposable record that is **not a post** (ROADMAP -> Network content).
 * A draft post would mean unfinished WUWF work; this is a candidate nobody here wrote. It has no versions or drafts, holds no story body,
 * and is cleaned out by the retention job. A `post` is made only when the story is published.
 *
 * Restricted stories (NPR's `isRestrictedToAuthorizedOrgServiceIds`) are never saved here: they are filtered out when read.
 *
 * Status: `new` (waiting), `held` (kept for later), `dismissed` (a tombstone: only the CDS id stays, so the story does not come back),
 * `published` (a post exists), `gone` (the source removed a story we had published; an editor decides).
 */
export const NetworkItems: CollectionConfig = {
  slug: 'network-items',
  labels: { singular: 'Network story', plural: 'Network stories' },
  access: {
    read: requirePermission('content.write'),
    // Rows are created and removed by the poll and the retention job. Editors change only a story's status (and may delete a stray).
    create: () => false,
    update: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
  },
  admin: {
    group: 'Network',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'source', 'publishedAt'],
    description: 'Stories waiting for an editor, and a record of what was found. The queue is the way to work through them.',
  },
  hooks: {
    beforeChange: [
      ({ data, originalDoc, operation, req }) => {
        if (operation !== 'update' || !originalDoc || data?.status === undefined) return data
        const bySystem = req.context?.networkSystem === true
        if (!statusChangeAllowed(originalDoc.status as NetworkStatus, data.status as NetworkStatus, bySystem)) {
          throw new APIError(`A story that is "${originalDoc.status}" cannot be set to "${data.status}" by hand.`, 400, undefined, true)
        }
        // A dismissed story keeps only its CDS id (so it is not found and queued again), never its words.
        if (data.status === 'dismissed' && originalDoc.status !== 'dismissed') return { ...data, ...tombstoneFields() }
        return data
      },
    ],
  },
  fields: [
    fromSource({ name: 'title', type: 'text', required: true }),
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'new',
      index: true,
      options: [
        { label: 'New', value: 'new' },
        { label: 'Kept for later', value: 'held' },
        { label: 'Dismissed', value: 'dismissed' },
        { label: 'Published', value: 'published' },
        { label: 'Removed at the source', value: 'gone' },
      ],
      admin: { position: 'sidebar' },
      // An editor may keep, release or dismiss a story (`lib/network/status.ts`). `published` and `gone` come only from the publish action
      // and the poll, which say so in the request context; the hook below refuses everything else.
      access: { create: () => false },
    },
    {
      name: 'source',
      type: 'relationship',
      relationTo: 'network-sources',
      required: true,
      index: true,
      access: systemOnly,
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'cdsId',
      type: 'text',
      label: 'NPR CDS document id',
      required: true,
      unique: true,
      index: true,
      access: systemOnly,
      admin: { position: 'sidebar', readOnly: true, description: 'CDS\'s own id. The same story found twice is one row.' },
    },
    fromSource({ name: 'teaser', type: 'textarea' }),
    fromSource({ name: 'publishedAt', type: 'date', index: true, admin: { date: { pickerAppearance: 'dayAndTime' } } }),
    fromSource({ name: 'modifiedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } }),
    fromSource({ name: 'canonicalUrl', type: 'text', label: 'Original address' }),
    fromSource({ name: 'ownerHrefs', type: 'json', admin: { hidden: true } }),
    fromSource({ name: 'brandingHrefs', type: 'json', admin: { hidden: true } }),
    fromSource({
      name: 'image',
      type: 'group',
      fields: [
        { name: 'href', type: 'text' },
        { name: 'hrefTemplate', type: 'text' },
        { name: 'width', type: 'number' },
        { name: 'height', type: 'number' },
        { name: 'altText', type: 'text' },
        { name: 'caption', type: 'text' },
        { name: 'credit', type: 'text' },
      ],
    }),
    fromSource({ name: 'imageDroppedAsRestricted', type: 'checkbox', defaultValue: false }),
    fromSource({
      name: 'audio',
      type: 'group',
      fields: [
        { name: 'href', type: 'text' },
        { name: 'mimeType', type: 'text' },
        { name: 'durationSeconds', type: 'number' },
      ],
    }),
    fromSource({
      name: 'audioSkipped',
      type: 'select',
      options: ['unavailable', 'expired', 'restricted', 'premium', 'tracked', 'sponsored', 'no-file'].map((value) => ({ label: value, value })),
    }),
    {
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
      access: systemOnly,
      admin: { position: 'sidebar', readOnly: true, description: 'The story made from this one when it was published.' },
    },
    { name: 'firstSeenAt', type: 'date', access: systemOnly, admin: { position: 'sidebar', readOnly: true } },
    { name: 'lastSeenAt', type: 'date', index: true, access: systemOnly, admin: { position: 'sidebar', readOnly: true } },
    { name: 'goneAt', type: 'date', access: systemOnly, admin: { position: 'sidebar', readOnly: true } },
  ],
}
