import type { GlobalConfig } from 'payload'

import { requirePermission } from '@/access/permissions'
import { revalidatePath, revalidateTag } from '@/lib/revalidate'
import { PROGRAM_KINDS } from '@/lib/sponsorship/programs'
import { validateSupportHref } from '@/lib/support-link'

/**
 * Sponsorship (boards 16 to 20b, the public "Sponsor WUWF" pages). The rate card, packages, audience figures and credit guidelines
 * are reviewed copy kept in code (`lib/sponsorship`), because each carries its source and a change to one is a reviewed change.
 * What belongs to editors is the list of events and programs a business can back (board 19: "a new event or program is one more
 * card with the same fields"), and the one sentence on the inquiry form that the university has to approve.
 *
 * This is not the ledger and not booking: it holds no sponsor, no contract and no placement. The deal lives in the Portal.
 */
export const Sponsorship: GlobalConfig = {
  slug: 'sponsorship',
  label: 'Sponsorship pages',
  admin: { group: 'Pages & hubs', livePreview: { url: '/sponsor/events' } },
  access: { read: () => true, update: requirePermission('content.publish') },
  hooks: {
    afterChange: [
      ({ doc, req: { context } }) => {
        if (!context.disableRevalidate) {
          revalidateTag('global_sponsorship', 'max')
          revalidatePath('/sponsor', 'layout')
        }
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'programs',
      type: 'array',
      maxRows: 12,
      labels: { singular: 'Event or program', plural: 'Events and programs' },
      admin: {
        description:
          'The events and programs a business can back, in the order they appear on /sponsor/events. A new one is one more row with the same fields. Only rows set to “Open to sponsors” are shown. Never state a price you have not confirmed: an empty price shows “Priced on request”.',
        initCollapsed: true,
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'name', type: 'text', required: true, maxLength: 80, admin: { width: '50%' } },
            {
              name: 'kind',
              type: 'select',
              required: true,
              defaultValue: 'live-series',
              options: PROGRAM_KINDS.map((k) => ({ label: k.label, value: k.value })),
              admin: { width: '25%' },
            },
            {
              name: 'status',
              type: 'select',
              required: true,
              defaultValue: 'open',
              options: [
                { label: 'Open to sponsors', value: 'open' },
                { label: 'Held (not shown)', value: 'held' },
                { label: 'Not yet open (not shown)', value: 'not-yet-open' },
              ],
              admin: { width: '25%' },
            },
          ],
        },
        {
          name: 'description',
          type: 'textarea',
          required: true,
          maxLength: 600,
          admin: { description: 'What it is, in plain words. The first sentence is also its summary on the “Start with your goal” picker.' },
        },
        {
          name: 'levels',
          type: 'array',
          maxRows: 8,
          labels: { singular: 'Level', plural: 'Levels' },
          admin: { description: 'Ways to partner. Each is priced, or says “Priced on request”.', initCollapsed: true },
          fields: [
            { name: 'name', type: 'text', required: true, maxLength: 60, admin: { description: 'For example Presenting partner.' } },
            { name: 'description', type: 'text', maxLength: 120, admin: { description: 'For example The series, across the season.' } },
            {
              name: 'price',
              type: 'text',
              maxLength: 60,
              admin: { description: 'Only a price corporate support has confirmed. Leave empty to show “Priced on request”.' },
            },
          ],
        },
        {
          name: 'recognition',
          type: 'textarea',
          maxLength: 400,
          admin: {
            description:
              'Where a partner is named (on air, on the event pages, in video credits, at the event). Shown as a plain line; leave empty to say nothing. Recognition follows the credit guidelines.',
          },
        },
        {
          name: 'pageUrl',
          type: 'text',
          label: 'Its page on this site',
          validate: validateSupportHref,
          admin: { description: 'For example /radiolive. Shown as a “More about it” link; leave empty for none.' },
        },
      ],
    },
    {
      name: 'inquiryNotice',
      type: 'textarea',
      maxLength: 400,
      admin: {
        description:
          'The sentence under the “Request a proposal” button: how WUWF uses what a business sends. Public pages that collect information carry the University of West Florida IT-04 policy notice, so have the wording reviewed before launch. Empty shows a plain factual sentence.',
      },
    },
  ],
}
