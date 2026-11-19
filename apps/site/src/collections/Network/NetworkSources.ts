import type { CollectionConfig, NumberFieldSingleValidation, TextFieldSingleValidation } from 'payload'

import { requirePermission } from '../../access/permissions'
import { isServiceId } from '../../lib/network/poll'

/**
 * Where network stories come from: one record per station or NPR section (ROADMAP -> Network content). Adding a station is a record, not a
 * deploy. A source finds stories in NPR's Content Distribution Service by **owner** (an Organization V4 service id such as `s583`, the
 * station that owns the document) or by **collection** (an integer id for one of NPR's own topics, programs or blogs).
 *
 * Mode decides what a found story does: `auto` publishes it into the source's section as it arrives; `queue` holds it for an editor in
 * the Network queue. What a source may *not* do is publish a restricted story: those are filtered out when they are read, never stored.
 *
 * Changing a source changes what goes live on the site without an editor, so it is a publisher's decision, like a section.
 */
export const NetworkSources: CollectionConfig = {
  slug: 'network-sources',
  labels: { singular: 'Network source', plural: 'Network sources' },
  access: {
    read: requirePermission('content.write'),
    create: requirePermission('content.publish'),
    update: requirePermission('content.publish'),
    delete: requirePermission('content.publish'),
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'findBy', 'mode', 'section', 'active', 'lastPolledAt'],
    description: 'Stations and NPR sections whose stories reach the Network queue.',
  },
  hooks: {
    // A story record belongs to its source (`source` is required), so a source cannot leave its stories behind. Stories already published
    // are posts and stay; only the candidate records go (including tombstones, which a re-added source would find again).
    beforeDelete: [
      async ({ id, req }) => {
        await req.payload.delete({ collection: 'network-items', where: { source: { equals: id } }, overrideAccess: true, req })
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true, admin: { description: 'As readers should see it: "WLRN", "NPR News".' } },
    {
      name: 'findBy',
      type: 'select',
      required: true,
      defaultValue: 'owner',
      options: [
        { label: 'Owner (station service ID)', value: 'owner' },
        { label: 'Collection (an NPR topic, program or blog)', value: 'collection' },
      ],
    },
    {
      name: 'serviceId',
      type: 'text',
      label: 'Service ID',
      admin: {
        condition: (data) => data?.findBy !== 'collection',
        description: 'An "s" and digits, such as s583: the station\'s Organization V4 service. Copy it from Grove\'s network tab.',
      },
      validate: ((value: unknown, { siblingData }: { siblingData?: { findBy?: string } }) => {
        if (siblingData?.findBy === 'collection') return true
        return typeof value === 'string' && isServiceId(value.trim()) ? true : 'A service ID is an s followed by digits, such as s583.'
      }) as TextFieldSingleValidation,
    },
    {
      name: 'collectionId',
      type: 'number',
      label: 'Collection ID',
      admin: { condition: (data) => data?.findBy === 'collection', description: 'NPR\'s number for a topic, program or blog (CDS "Table of Aggregations").' },
      validate: ((value: unknown, { siblingData }: { siblingData?: { findBy?: string } }) => {
        if (siblingData?.findBy !== 'collection') return true
        return typeof value === 'number' && Number.isInteger(value) && value > 0 ? true : 'A collection ID is a positive whole number.'
      }) as NumberFieldSingleValidation,
    },
    {
      name: 'mode',
      type: 'select',
      required: true,
      defaultValue: 'queue',
      options: [
        { label: 'Wait in the queue for an editor', value: 'queue' },
        { label: 'Publish on its own', value: 'auto' },
      ],
      admin: { description: 'Publishing on its own puts every new, unrestricted story from this source on the site without an editor.' },
    },
    {
      name: 'section',
      type: 'relationship',
      relationTo: 'sections',
      admin: { description: 'The section its stories go to (suggested in the queue; used when publishing on its own).' },
    },
    { name: 'active', type: 'checkbox', defaultValue: true, admin: { description: 'Uncheck to stop checking this source without deleting it.' } },
    { name: 'notes', type: 'textarea', admin: { description: 'Anything staff should know about this source.' } },
    {
      // What the last check found. Written only by the poll (system writes skip field access); shown, never edited.
      name: 'poll',
      type: 'group',
      label: 'Last check',
      admin: { position: 'sidebar' },
      fields: [
        { name: 'lastPolledAt', type: 'date', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } }, access: { create: () => false, update: () => false } },
        { name: 'cursor', type: 'date', label: 'Looking for stories published after', admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } }, access: { create: () => false, update: () => false } },
        { name: 'foundNew', type: 'number', admin: { readOnly: true }, access: { create: () => false, update: () => false } },
        { name: 'skippedRestricted', type: 'number', label: 'Restricted stories skipped', admin: { readOnly: true }, access: { create: () => false, update: () => false } },
        { name: 'error', type: 'textarea', admin: { readOnly: true }, access: { create: () => false, update: () => false } },
      ],
    },
  ],
}
