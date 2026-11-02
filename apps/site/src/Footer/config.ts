import type { GlobalConfig } from 'payload'

import { link } from '@/fields/link'
import { requirePermission } from '@/access/permissions'
import { revalidateFooter } from './hooks/revalidateFooter'

export const Footer: GlobalConfig = {
  slug: 'footer',
  access: {
    read: () => true,
    update: requirePermission('content.publish'),
  },
  fields: [
    {
      name: 'columns',
      type: 'array',
      maxRows: 5,
      admin: { description: 'Link columns, left to right, each with a heading.', initCollapsed: true },
      fields: [
        { name: 'heading', type: 'text', required: true },
        {
          name: 'links',
          type: 'array',
          maxRows: 10,
          fields: [link({ appearances: false })],
          admin: { components: { RowLabel: '@/Footer/RowLabel#RowLabel' } },
        },
      ],
    },
    {
      name: 'navItems',
      type: 'array',
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 8,
      admin: {
        description: 'The legal row under the columns (Public Inspection File, EEO report, privacy…).',
        initCollapsed: true,
        components: {
          RowLabel: '@/Footer/RowLabel#RowLabel',
        },
      },
    },
  ],
  hooks: {
    afterChange: [revalidateFooter],
  },
}
