import type { CollectionConfig } from 'payload'
import { slugField } from 'payload'

import { anyone } from '../access/anyone'
import { requirePermission } from '../access/permissions'
import { ensureSlug } from '../hooks/ensureSlug'

/**
 * A byline: reporters, hosts, fellows, student journalists. Public by design. This is deliberately not
 * the staff `users` collection, whose read access is locked to protect staff privacy; a contributor
 * may be someone with no CMS login at all (a guest host, a Voyager student).
 */
export const Contributors: CollectionConfig = {
  slug: 'contributors',
  labels: { singular: 'Contributor', plural: 'Contributors' },
  access: {
    read: anyone,
    create: requirePermission('content.write'),
    update: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
  },
  admin: { group: 'Editorial', useAsTitle: 'name', defaultColumns: ['name', 'title', 'updatedAt'] },
  hooks: { beforeValidate: [ensureSlug('name')] },
  fields: [
    { name: 'name', type: 'text', required: true },
    slugField({ useAsSlug: 'name' }),
    { name: 'title', type: 'text', admin: { description: 'For example "Coastal Futures Fellow".' } },
    { name: 'bio', type: 'textarea' },
    { name: 'photo', type: 'upload', relationTo: 'media' },
    {
      name: 'initials',
      type: 'text',
      maxLength: 3,
      admin: { description: 'Shown when there is no photo. Defaults to the name\'s initials.' },
      hooks: {
        beforeValidate: [
          ({ value, siblingData }) => {
            if (value) return value
            const name = String(siblingData?.name ?? '').trim()
            return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
          },
        ],
      },
    },
  ],
}
