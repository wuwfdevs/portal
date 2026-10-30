import type { CollectionConfig, Field } from 'payload'
import { slugField } from 'payload'

import { anyone } from '../../access/anyone'
import { requirePermission } from '../../access/permissions'
import { ensureSlug } from '../../hooks/ensureSlug'
import {
  revalidateCollection,
  revalidateCollectionDelete,
} from '../../hooks/revalidateUnderwriting'

/**
 * Fellowships, series and productions are the only things an underwriting agreement can attach to.
 * (A topic is navigation, a publishing identity is attribution; neither is ever underwritten.) One
 * factory keeps the three alike so the resolution rules apply to them identically.
 */
export function fundableCollection(opts: {
  slug: 'fellowships' | 'series' | 'productions'
  singular: string
  plural: string
  description: string
  extraFields?: Field[]
}): CollectionConfig {
  return {
    slug: opts.slug,
    labels: { singular: opts.singular, plural: opts.plural },
    access: {
      read: anyone,
      create: requirePermission('content.write'),
      update: requirePermission('content.write'),
      delete: requirePermission('content.publish'),
    },
    admin: { group: 'Editorial', useAsTitle: 'title', description: opts.description, defaultColumns: ['title', 'slug', 'updatedAt'] },
    fields: [
      { name: 'title', type: 'text', required: true },
      slugField(),
      { name: 'summary', type: 'textarea', admin: { description: 'One or two sentences, shown on cards and hubs.' } },
      { name: 'heroImage', type: 'upload', relationTo: 'media' },
      ...(opts.extraFields ?? []),
      {
        name: 'agreements',
        type: 'relationship',
        relationTo: 'underwriting-agreements',
        hasMany: true,
        // Attaching a funder is a commercial decision, not an editorial one.
        access: {
          create: ({ req }) => Boolean(req.user?.roles?.some((r: string) => r === 'sponsorship' || r === 'administrator')),
          update: ({ req }) => Boolean(req.user?.roles?.some((r: string) => r === 'sponsorship' || r === 'administrator')),
        },
        admin: {
          position: 'sidebar',
          description: 'Underwriting agreements acknowledged on everything in this collection. Managed by the sponsorship team.',
        },
      },
    ],
    hooks: {
      beforeValidate: [ensureSlug('title')],
      afterChange: [revalidateCollection],
      afterDelete: [revalidateCollectionDelete],
    },
  }
}
