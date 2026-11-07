import type { GlobalConfig } from 'payload'

import { link } from '@/fields/link'
import { requirePermission } from '@/access/permissions'
import { revalidateHeader } from './hooks/revalidateHeader'

export const Header: GlobalConfig = {
  slug: 'header',
  admin: { group: 'Site settings', livePreview: { url: '/' } },
  access: {
    read: () => true,
    update: requirePermission('content.publish'),
  },
  fields: [
    {
      name: 'menus',
      type: 'array',
      maxRows: 6,
      labels: { singular: 'Menu', plural: 'Menus' },
      admin: {
        description:
          'The menus across the top (board 27: News, Shows, Watch, Community, About). Each opens a panel under the header. Listen live, Search, Sign in and Donate stay outside them. While this is empty the plain links below are shown instead.',
        initCollapsed: true,
        components: { RowLabel: '@/Header/RowLabel#MenuRowLabel' },
      },
      fields: [
        { name: 'label', type: 'text', required: true, maxLength: 24, admin: { description: 'The word in the header, e.g. "News".' } },
        { name: 'heading', type: 'text', maxLength: 60, admin: { description: 'The panel\'s title, e.g. "Shows and podcasts". Empty uses the label.' } },
        { name: 'blurb', type: 'textarea', maxLength: 200, admin: { description: 'One sentence under the title.' } },
        {
          name: 'links',
          type: 'array',
          required: true,
          minRows: 1,
          maxRows: 16,
          fields: [link({ appearances: false })],
          admin: { initCollapsed: true, components: { RowLabel: '@/Header/RowLabel#RowLabel' } },
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
        description: 'Plain links, shown only while there are no menus above. Kept so the header is never empty during the change.',
        initCollapsed: true,
        components: {
          RowLabel: '@/Header/RowLabel#RowLabel',
        },
      },
    },
    {
      name: 'sections',
      type: 'array',
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 12,
      admin: {
        description:
          'The second row: fellowships, series and topics to feature. Editors curate it; nothing is hard-coded.',
        initCollapsed: true,
        components: {
          RowLabel: '@/Header/RowLabel#RowLabel',
        },
      },
    },
  ],
  hooks: {
    afterChange: [revalidateHeader],
  },
}
