import type { CollectionConfig } from 'payload'

import { fieldRequires, publishedOrContentStaff, requirePermission } from '../../access/permissions'
import { enforcePublishPermission } from '../../hooks/enforcePublishPermission'
import { legacyIdentityWriteOnce } from '../../hooks/pathHooks'
import { pathField } from '../../fields/path'
import { artistField, organizationField, priceFields, scheduleField, venueField } from './fields'
import { eventBoundsBeforeChange, eventPathBeforeChange, revalidateEvent, revalidateEventDelete } from './hooks'

/**
 * A community-calendar event: something happening in the region that WUWF lists as a service (not WUWF's own journalism, so
 * it carries no underwriting line). Drafts are private; a published event is public at its address. Staff create them here,
 * the public submits through the form (see `event-submissions`), and the 1,474 from Grove arrive through the importer at
 * Grove's own addresses. The submitter's contact details are never part of an event.
 */
export const Events: CollectionConfig = {
  slug: 'events',
  labels: { singular: 'Event', plural: 'Events' },
  access: {
    read: publishedOrContentStaff,
    create: requirePermission('content.write'),
    update: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
  },
  admin: {
    group: 'Community calendar',
    useAsTitle: 'title',
    defaultColumns: ['title', 'firstDate', 'lastDate', '_status'],
    listSearchableFields: ['title', 'venue.name', 'organization.name'],
    description: 'Events on the community calendar. Saving a draft is private; publishing makes it public.',
  },
  defaultSort: '-firstDate',
  fields: [
    { name: 'title', type: 'text', required: true, index: true },
    { name: 'teaser', type: 'textarea', maxLength: 300, admin: { description: 'One or two sentences for the calendar list. Made from the description when empty.' } },
    { name: 'description', type: 'richText' },
    { name: 'categories', type: 'relationship', relationTo: 'event-categories', hasMany: true, index: true },
    scheduleField,
    venueField(false),
    organizationField,
    artistField,
    ...priceFields,
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Optional. Give it alt text in the media library.' },
    },
    pathField,
    {
      name: 'firstDate',
      type: 'text',
      index: true,
      admin: { position: 'sidebar', readOnly: true, description: 'Set from "When". The calendar lists an event until its last date has passed.' },
    },
    { name: 'lastDate', type: 'text', index: true, admin: { position: 'sidebar', readOnly: true } },
    {
      name: 'submissionId',
      type: 'text',
      index: true,
      access: { read: fieldRequires('content.write'), update: () => false },
      admin: { position: 'sidebar', readOnly: true, description: 'The submission this event was made from, if it came through the public form.' },
    },
    {
      name: 'legacy',
      type: 'group',
      label: 'From Grove',
      admin: { position: 'sidebar', description: 'Set by the migration. Leave empty for new events.' },
      fields: [
        { name: 'legacyPath', type: 'text', unique: true, index: true, admin: { description: 'The Grove path this came from. Set by the migration and then fixed.' } },
        { name: 'groveId', type: 'text', unique: true, index: true, admin: { description: 'Grove\'s contentId. Set by the migration and then fixed; a re-run matches on it.' } },
        { name: 'modifiedAt', type: 'date' },
        { name: 'needsAttention', type: 'checkbox', defaultValue: false, admin: { description: 'The migration could not read something on this page. See the notes, fix it, then clear this.' } },
        { name: 'notes', type: 'textarea', admin: { description: 'What the migration noted about this page.' } },
      ],
    },
  ],
  hooks: {
    beforeChange: [enforcePublishPermission, eventBoundsBeforeChange, legacyIdentityWriteOnce, eventPathBeforeChange],
    afterChange: [revalidateEvent],
    afterDelete: [revalidateEventDelete],
  },
  versions: { drafts: { autosave: false }, maxPerDoc: 10 },
}
