import type { CollectionConfig } from 'payload'
import { slugField } from 'payload'

import { requirePermission } from '../../access/permissions'
import { ensureSlug } from '../../hooks/ensureSlug'

/** An organization that funds reporting or buys sponsorship. Internal: the public sees only what an agreement renders. */
export const Sponsors: CollectionConfig = {
  slug: 'sponsors',
  labels: { singular: 'Sponsor', plural: 'Sponsors' },
  access: {
    create: requirePermission('sponsorship.manage'),
    update: requirePermission('sponsorship.manage'),
    delete: requirePermission('sponsorship.manage'),
    // Editors may need to see who a fellowship's funder is; the public never reads this collection.
    read: ({ req }) => Boolean(req.user),
  },
  admin: { group: 'Commercial', useAsTitle: 'name', defaultColumns: ['name', 'url', 'updatedAt'] },
  hooks: { beforeValidate: [ensureSlug('name')] },
  fields: [
    { name: 'name', type: 'text', required: true },
    slugField({ useAsSlug: 'name' }),
    { name: 'url', type: 'text', admin: { description: 'The sponsor\'s website, if it may be linked.' } },
    { name: 'logo', type: 'upload', relationTo: 'media' },
    { name: 'notes', type: 'textarea', admin: { description: 'Internal. Never shown to the public.' } },
  ],
}
