import type { CollectionConfig } from 'payload'
import { slugField } from 'payload'

import { anyone } from '../access/anyone'
import { requirePermission } from '../access/permissions'
import { ensureSlug } from '../hooks/ensureSlug'
import { validateSupportHref } from '../lib/support-link'
import { revalidatePath } from '../lib/revalidate'

/**
 * A musician who plays RadioLive. Kept apart from `contributors` (the people who write and host for WUWF): a performer has no
 * stories or byline, and their page is their picture, a short bio and the shows they played. An artist appears on the RadioLive
 * page only once they are in the lineup of a published show.
 */
export const Artists: CollectionConfig = {
  slug: 'artists',
  labels: { singular: 'Artist', plural: 'Artists' },
  access: { read: anyone, create: requirePermission('content.write'), update: requirePermission('content.write'), delete: requirePermission('content.publish') },
  admin: { group: 'RadioLive', useAsTitle: 'name', defaultColumns: ['name', 'updatedAt'], description: 'Musicians who play RadioLive. Add one here, then put them in a show\'s lineup.' },
  hooks: {
    beforeValidate: [ensureSlug('name')],
    afterChange: [({ doc, previousDoc, req: { context } }) => {
      if (!context.disableRevalidate) for (const slug of new Set([doc?.slug, previousDoc?.slug])) if (typeof slug === 'string' && slug) revalidatePath(`/radiolive/artists/${slug}`)
      return doc
    }],
  },
  fields: [
    { name: 'name', type: 'text', required: true, index: true },
    slugField({ useAsSlug: 'name' }),
    { name: 'photo', type: 'upload', relationTo: 'media', admin: { description: 'A portrait, ideally 4:5. Give it alt text in the media library.' } },
    { name: 'bio', type: 'textarea', maxLength: 1200, admin: { description: 'A few sentences. Only what the artist has approved.' } },
    { name: 'link', type: 'text', validate: validateSupportHref, admin: { description: 'The artist\'s own site. A secure https:// address.' } },
  ],
}
