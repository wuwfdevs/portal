import type { CollectionConfig } from 'payload'

import { anyone } from '../../access/anyone'
import { requirePermission } from '../../access/permissions'
import { ensureSlug } from '../../hooks/ensureSlug'
import { revalidatePath } from '../../lib/revalidate'

/** The community calendar's categories (Grove's twelve). Listeners filter by them; submitters choose up to three. */
export const EventCategories: CollectionConfig = {
  slug: 'event-categories',
  labels: { singular: 'Event category', plural: 'Event categories' },
  access: { read: anyone, create: requirePermission('content.publish'), update: requirePermission('content.publish'), delete: requirePermission('content.publish') },
  admin: { group: 'Community calendar', useAsTitle: 'title', defaultColumns: ['title', 'slug'] },
  defaultSort: 'title',
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true, admin: { position: 'sidebar' } },
    {
      name: 'legacy',
      type: 'group',
      label: 'From Grove',
      admin: { position: 'sidebar', description: 'Set by the migration. Leave empty for new categories.' },
      fields: [{ name: 'groveId', type: 'text', unique: true, index: true, admin: { description: 'Grove\'s id for this category (used in its filter addresses).' } }],
    },
  ],
  hooks: {
    beforeValidate: [ensureSlug('title')],
    afterChange: [({ doc, req: { context } }) => { if (!context.disableRevalidate) revalidatePath('/community-calendar'); return doc }],
  },
}
