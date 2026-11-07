import type { GlobalConfig } from 'payload'

import { link } from '@/fields/link'
import { requirePermission } from '@/access/permissions'
import { revalidateFooter } from './hooks/revalidateFooter'

export const Footer: GlobalConfig = {
  slug: 'footer',
  admin: { group: 'Site settings', livePreview: { url: '/' } },
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
    {
      name: 'publicFile',
      type: 'group',
      label: 'FCC public file',
      admin: {
        description:
          "Shown on every page. The FCC requires a link to the station's online public inspection file from the home page (47 CFR 73.3527), and a contact for people with disabilities who need help with the file's contents. Until the address is set, no link shows: set it before go-live.",
      },
      fields: [
        {
          name: 'url',
          type: 'text',
          label: 'Public file address',
          validate: (value: string | null | undefined) => {
            if (!value) return true
            try {
              const u = new URL(value)
              return u.protocol === 'https:' && u.hostname === 'publicfiles.fcc.gov'
                ? true
                : 'Use the station’s page on https://publicfiles.fcc.gov/.'
            } catch {
              return 'Use a full address, starting with https://publicfiles.fcc.gov/.'
            }
          },
          admin: { description: 'The station’s page on publicfiles.fcc.gov (for an FM station, /fm-profile/<call sign>). Open it to check before saving.' },
        },
        { name: 'label', type: 'text', defaultValue: 'FCC Public File', required: true },
        {
          name: 'accessibilityContact',
          type: 'textarea',
          maxLength: 300,
          admin: { description: 'Who helps people with disabilities with the public file, and how to reach them, e.g. "Questions about the public file, including accessibility: [name], [phone], [email]."' },
        },
      ],
    },
  ],
  hooks: {
    afterChange: [revalidateFooter],
  },
}
