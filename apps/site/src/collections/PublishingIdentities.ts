import type { CollectionConfig } from 'payload'
import { slugField } from 'payload'

import { anyone } from '../access/anyone'
import { requirePermission } from '../access/permissions'
import { ensureSlug } from '../hooks/ensureSlug'

/**
 * The brand a piece appears under: WUWF News, The Voyager, Unearthing Florida, RadioLive, or a show.
 * One design system and one CMS; an identity carries a theme and a landing page, not a separate
 * instance. An identity is attribution, never sponsorship: it cannot hold an underwriting agreement.
 */
export const PublishingIdentities: CollectionConfig = {
  slug: 'publishing-identities',
  labels: { singular: 'Publishing identity', plural: 'Publishing identities' },
  access: {
    read: anyone,
    create: requirePermission('settings.manage'),
    update: requirePermission('settings.manage'),
    delete: requirePermission('settings.manage'),
  },
  admin: { group: 'Editorial', useAsTitle: 'name', defaultColumns: ['name', 'kind', 'updatedAt'] },
  hooks: { beforeValidate: [ensureSlug('name')] },
  fields: [
    { name: 'name', type: 'text', required: true },
    slugField({ useAsSlug: 'name' }),
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'newsroom',
      options: [
        { label: 'WUWF newsroom', value: 'newsroom' },
        { label: 'Partner newsroom (links home to its own site)', value: 'partner' },
        { label: 'Original production', value: 'production' },
        { label: 'Show', value: 'show' },
      ],
    },
    { name: 'tagline', type: 'text' },
    { name: 'description', type: 'textarea' },
    { name: 'homeUrl', type: 'text', admin: { description: 'Where a partner identity\'s cards link. Empty for WUWF-run identities.' } },
    { name: 'logo', type: 'upload', relationTo: 'media' },
    {
      name: 'themeColors',
      type: 'json',
      admin: { description: 'Color token overrides for this identity, e.g. {"surface-dark": "#000000"}. Applied through @wuwf/design-tokens.' },
    },
  ],
}
