import type { CollectionConfig } from 'payload'

import { fieldRequires, publishedOrContentStaff, requirePermission } from '../../access/permissions'
import { enforcePublishPermission } from '../../hooks/enforcePublishPermission'
import { legacyIdentityWriteOnce } from '../../hooks/pathHooks'
import { pathField } from '../../fields/path'
import { artistField, organizationField, priceFields, scheduleField, venueField } from './fields'
import { eventBoundsBeforeChange, eventPathBeforeChange, eventReviewBeforeChange, revalidateEvent, revalidateEventDelete } from './hooks'

/**
 * A community-calendar event: something happening in the region that WUWF lists as a service (not WUWF's own journalism, so
 * it carries no underwriting line). Drafts are private; a published event is public at its address. Staff create them here,
 * the 1,474 from Grove arrive through the importer at Grove's own addresses, and the public submits through the form, which
 * saves a DRAFT with a review status ("Pending review"). Publishing is approving: only a publisher can, and it clears the
 * review. One collection, one list: filter the list by review status to see what is waiting. Everything about who sent an event
 * (their contact details, the review notes, the picture that came with it) is readable by staff only, by field access, so it
 * can never reach a public page or the public API.
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
    defaultColumns: ['title', 'review.status', 'firstDate', '_status'],
    listSearchableFields: ['title', 'venue.name', 'organization.name'],
    description: 'Events on the community calendar, including those sent in through the public form (they arrive as drafts marked "Pending review"). Saving a draft is private; publishing approves it and makes it public.',
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
      name: 'review',
      type: 'group',
      label: 'Review',
      access: { read: fieldRequires('content.write') },
      admin: { position: 'sidebar', description: 'For events sent in through the public form. Staff only. Publishing the event approves it.' },
      fields: [
        {
          name: 'status',
          type: 'select',
          index: true,
          access: { read: fieldRequires('content.write') },
          options: [
            { label: 'Pending review', value: 'pending' },
            { label: 'Needs information', value: 'needs-info' },
            { label: 'Rejected', value: 'rejected' },
            { label: 'Approved (published)', value: 'approved' },
          ],
          admin: { description: 'Empty for an event staff made. "Approved" is set by publishing, which only a publisher can do; it cannot be chosen here.' },
        },
        { name: 'concerns', type: 'textarea', access: { read: fieldRequires('content.write') }, admin: { readOnly: true, description: 'Things the station\'s guidelines ask a reviewer to check. Advisory; recomputed on every save.' } },
        { name: 'note', type: 'textarea', label: 'Internal note', access: { read: fieldRequires('content.write') }, admin: { description: 'For staff only. Nothing is sent to the submitter.' } },
        { name: 'reviewedBy', type: 'relationship', relationTo: 'users', access: { read: fieldRequires('content.write') }, admin: { readOnly: true } },
        { name: 'reviewedAt', type: 'date', access: { read: fieldRequires('content.write') }, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    {
      name: 'submitter',
      type: 'group',
      label: 'Who sent it',
      access: { read: fieldRequires('content.write') },
      admin: { position: 'sidebar', description: 'For questions about the event only. Staff only: never shown on the site, never in the public API.' },
      fields: [
        { name: 'name', type: 'text', access: { read: fieldRequires('content.write') } },
        { name: 'email', type: 'email', access: { read: fieldRequires('content.write') } },
        { name: 'role', type: 'select', access: { read: fieldRequires('content.write') }, options: [{ label: 'A listener', value: 'listener' }, { label: 'A venue', value: 'venue' }, { label: 'An artist', value: 'artist' }, { label: 'A promoter', value: 'promoter' }] },
      ],
    },
    {
      name: 'submittedImage',
      type: 'upload',
      relationTo: 'event-submission-images',
      access: { read: fieldRequires('content.write') },
      admin: { position: 'sidebar', description: 'The picture that came with the submission. It is private. To use it, add it to the media library with alt text and choose it as the event\'s picture.' },
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
    beforeChange: [enforcePublishPermission, eventBoundsBeforeChange, legacyIdentityWriteOnce, eventPathBeforeChange, eventReviewBeforeChange],
    afterChange: [revalidateEvent],
    afterDelete: [revalidateEventDelete],
  },
  versions: { drafts: { autosave: false }, maxPerDoc: 10 },
}
