import type { GlobalConfig } from 'payload'

import { requirePermission } from '@/access/permissions'

import { revalidateUnearthingHub } from './hooks/revalidate'

/**
 * The Unearthing Florida hub (`/unearthing-florida`, board 11). Its structure is fixed; staff choose what fills it. The episodes,
 * the timeline counts, the collections and the pins all come from the episodes and sites themselves, so there is nothing here to
 * keep in step. Showing something on a hub is publishing, so it takes publish permission.
 */
export const UnearthingHub: GlobalConfig = {
  slug: 'unearthing-hub',
  label: 'Unearthing Florida hub',
  access: { read: () => true, update: requirePermission('content.publish') },
  hooks: { afterChange: [revalidateUnearthingHub] },
  fields: [
    {
      name: 'production',
      type: 'relationship',
      relationTo: 'productions',
      admin: { description: 'The Unearthing Florida production. Its title, summary and funding line are used; its episodes fill the hub. Until it is chosen, the hub says it is not set up.' },
    },
    { name: 'dateline', type: 'text', admin: { description: 'The small line above the title, e.g. "Northwest Florida to the Keys".' } },
    { name: 'about', type: 'textarea', admin: { description: 'The "About the project" box: who makes it, since when, when it airs.' } },
    {
      name: 'featured',
      type: 'relationship',
      relationTo: 'posts',
      admin: { description: 'The episode shown large with its player. Empty means the newest episode.' },
      filterOptions: { _status: { equals: 'published' } },
    },
    {
      name: 'thenNow',
      type: 'group',
      label: 'Then & now',
      admin: { description: 'Pairs a history episode with today\'s reporting on the same place. Leave the pairs empty to hide the band.' },
      fields: [
        { name: 'heading', type: 'text', admin: { description: 'For example "People have rebuilt on this coast after storms for 500 years."' } },
        { name: 'blurb', type: 'text' },
        {
          name: 'pairs',
          type: 'array',
          maxRows: 4,
          labels: { singular: 'Pair', plural: 'Pairs' },
          fields: [
            { name: 'then', type: 'relationship', relationTo: 'posts', required: true, label: 'Then (history episode)', filterOptions: { _status: { equals: 'published' } } },
            { name: 'now', type: 'relationship', relationTo: 'posts', required: true, label: 'Now (today\'s reporting)', filterOptions: { _status: { equals: 'published' } } },
          ],
        },
      ],
    },
  ],
}
