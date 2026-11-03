import type { CollectionConfig } from 'payload'

import { requirePermission } from '../../access/permissions'
import { artistField, organizationField, priceFields, scheduleField, venueField } from './fields'
import { submissionBeforeChange } from './hooks'

/**
 * The review queue for the community calendar. A public submission is written here (by the form's server action, through
 * the Local API) and nowhere else; it is not public in any form. Staff edit it (the guidelines say WUWF may edit any
 * announcement), ask for information, reject it, or approve it. Approving needs the publish permission and makes a live event
 * in the `events` collection. The submitter's name and email are shown to staff only and never copied to the event.
 */
export const EventSubmissions: CollectionConfig = {
  slug: 'event-submissions',
  labels: { singular: 'Event submission', plural: 'Event submissions' },
  access: {
    read: requirePermission('content.write'),
    create: requirePermission('content.write'),
    update: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
  },
  admin: {
    group: 'Community calendar',
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'createdAt', 'concerns'],
    listSearchableFields: ['title', 'submitter.email', 'organization.name'],
    description: 'Events sent in through the public form. Review, edit, then set the status to Approved to put it on the calendar (publishers only).',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { label: 'Pending review', value: 'pending' },
        { label: 'Needs information', value: 'needs-info' },
        { label: 'Approved (live)', value: 'approved' },
        { label: 'Rejected', value: 'rejected' },
      ],
      admin: { position: 'sidebar', description: 'Approving makes the event live at once, so only a publisher can. It cannot be undone here; edit or unpublish the event instead.' },
    },
    { name: 'concerns', type: 'textarea', admin: { position: 'sidebar', readOnly: true, description: 'Things the station\'s guidelines ask a reviewer to check. Advisory.' } },
    { name: 'reviewNote', type: 'textarea', label: 'Internal note', admin: { position: 'sidebar', description: 'For staff only. Nothing is sent to the submitter.' } },
    { name: 'reviewedBy', type: 'relationship', relationTo: 'users', admin: { position: 'sidebar', readOnly: true } },
    { name: 'reviewedAt', type: 'date', admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'event', type: 'relationship', relationTo: 'events', admin: { position: 'sidebar', readOnly: true, description: 'The live event made from this submission.' } },
    { name: 'clientKey', type: 'text', index: true, access: { read: () => false }, admin: { hidden: true } },

    { name: 'title', type: 'text', required: true },
    { name: 'categories', type: 'relationship', relationTo: 'event-categories', hasMany: true, maxRows: 3, required: true },
    { name: 'description', type: 'textarea', maxLength: 4000, admin: { description: 'Plain text. Blank lines make paragraphs.' } },
    scheduleField,
    venueField(true),
    organizationField,
    artistField,
    ...priceFields,
    {
      name: 'image',
      type: 'upload',
      relationTo: 'event-submission-images',
      admin: { description: 'The picture that came with the submission. It is private. To use it, add it to the media library with alt text and attach it to the event.' },
    },
    {
      name: 'submitter',
      type: 'group',
      label: 'Who sent it',
      admin: { description: 'For questions about the event only. Never shown on the site and never copied to the event.' },
      fields: [
        { name: 'name', type: 'text' },
        { name: 'email', type: 'email', required: true },
        { name: 'role', type: 'select', options: [{ label: 'A listener', value: 'listener' }, { label: 'A venue', value: 'venue' }, { label: 'An artist', value: 'artist' }, { label: 'A promoter', value: 'promoter' }] },
      ],
    },
  ],
  hooks: { beforeChange: [submissionBeforeChange] },
}
