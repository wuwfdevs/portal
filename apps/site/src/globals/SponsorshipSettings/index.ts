import type { GlobalConfig } from 'payload'

import { fieldRequires, requirePermission } from '@/access/permissions'
import { revalidateTag } from '@/lib/revalidate'
import { PROGRAM_KINDS } from '@/lib/sponsorship/programs'
import { validateSupportHref } from '@/lib/support-link'

import { area, group, list, num, text } from '../fieldBuilders'

/**
 * Sponsorship settings (PAGE-BLOCKS.md → Shared data stays in globals). The data the sponsorship pages' blocks read: contact details, what the
 * proposal form offers, the on-air rate card, the Carpool prices, the new-sponsor packages and the events and programs open to sponsors. The
 * words of a page (headings, paragraphs, labels, sources) are on its blocks; **a price, a rate or an address is here, once**, so one change
 * reaches every page that shows it.
 *
 * This is the public price list, not the ledger: no sponsor, contract or placement is held here. The deal lives in the Portal.
 *
 * Blocks read this only through `getCachedGlobal` (tag `global_sponsorship-settings`), so the save below reaches every page that holds one.
 * The staff-only inquiry address is dropped by `lib/sponsorship/load.ts` and never reaches a component.
 */
export const SponsorshipSettings: GlobalConfig = {
  slug: 'sponsorship-settings',
  label: 'Sponsorship settings',
  admin: { group: 'Site settings', livePreview: { url: '/sponsor' }, description: 'Prices, rates, contact details and the proposal form’s choices. The words on each sponsorship page are on the page’s sections.' },
  access: { read: () => true, update: requirePermission('content.publish') },
  hooks: {
    afterChange: [
      ({ doc, req: { context } }) => {
        if (!context.disableRevalidate) revalidateTag('global_sponsorship-settings', 'max')
        return doc
      },
    ],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Contact and form',
          fields: [
            text('phone', { admin: { description: 'Corporate support’s phone number as people read it, e.g. 850 473-7453. The link is built from the digits.' } }),
            text('address'),
            text('serviceLine', { admin: { description: 'Printed with the phone number at the foot of every sponsorship page.' } }),
            {
              name: 'inquiryEmail',
              type: 'email',
              label: 'Where proposal requests are sent',
              access: { read: fieldRequires('content.publish'), update: fieldRequires('content.publish') },
              admin: {
                description:
                  'Corporate support’s address. Every “Request a proposal” is emailed here (through WUWF’s mail service) and the site keeps no copy. Only staff can see this field; it is never sent to a visitor’s browser. Empty, the form says online requests are not set up and gives the phone number.',
              },
            },
            area('inquiryNotice', {
              maxLength: 400,
              admin: { description: 'The sentence under “Request a proposal”: how WUWF uses what a business sends. The University of West Florida IT-04 policy notice goes here once it is reviewed.' },
            }),
            text('notSetUpMessage', { admin: { description: 'Shown when the form cannot send because no address is set above. Include the phone number.' } }),
            text('failedMessage', { admin: { description: 'Shown when sending fails. Include the phone number.' } }),
            list('interests', [text('label', { required: true, maxLength: 80 })], { singular: 'Choice', max: 12, description: '“What are you interested in?” on the form.' }),
            list('budgets', [text('label', { required: true, maxLength: 60 })], { singular: 'Range', max: 8, description: 'The budget ranges, first one is the default.' }),
          ],
        },
        {
          label: 'On-air rates',
          fields: [
            list(
              'dayparts',
              [
                text('label', { required: true, maxLength: 60 }),
                text('when', { maxLength: 100 }),
                num('open', { required: true, admin: { description: 'Dollars per credit, e.g. 55 or 25.5.' } }),
                num('m3', { required: true, label: '3 months' }),
                num('m6', { required: true, label: '6 months' }),
                num('y1', { required: true, label: '1 year' }),
              ],
              { singular: 'Daypart', max: 12, description: 'The rate card, one row per daypart. The rate estimator reads these numbers.' },
            ),
            list('creditCounts', [num('count', { required: true, min: 1 })], { singular: 'Count', max: 8, description: 'The schedule sizes the estimator offers.' }),
            num('prepayPercent', { min: 0, max: 100, admin: { description: 'Extra discount for prepaying a rate-card schedule.' } }),
            num('nonprofitPercent', { min: 0, max: 100, admin: { description: 'Nonprofit discount off open rates.' } }),
          ],
        },
        {
          label: 'Carpool and packages',
          fields: [
            group('carpool', [
              num('sixMonths', { admin: { description: 'Dollars for six months.' } }),
              num('oneYear', { admin: { description: 'Dollars for a year.' } }),
            ], 'The Carpool Plan.'),
            group('packages', [
              num('openDriveRate', { admin: { description: 'What a drive-time credit normally costs, in dollars.' } }),
              num('newDriveRate', { admin: { description: 'What a first-time sponsor pays for one, in dollars.' } }),
              list(
                'items',
                [
                  text('name', { required: true }),
                  area('description', { maxLength: 400 }),
                  num('price', { required: true, admin: { description: 'Dollars.' } }),
                  num('value', {
                    required: true,
                    admin: { description: 'What the same credits cost at the rate card, in dollars. The page shows “You save” as the difference.' },
                    validate: (v: unknown, { siblingData }: { siblingData?: { price?: number } }) =>
                      typeof v === 'number' && typeof siblingData?.price === 'number' && v < siblingData.price ? 'The value must not be less than the price.' : true,
                  }),
                ],
                { singular: 'Package', max: 8 },
              ),
            ], 'The new-sponsor packages.'),
          ],
        },
        {
          label: 'Events and programs',
          fields: [
            {
              name: 'programs',
              type: 'array',
              maxRows: 12,
              labels: { singular: 'Event or program', plural: 'Events and programs' },
              admin: {
                description:
                  'The events and programs a business can back, in the order they appear. A new one is one more row with the same fields. Only rows set to “Open to sponsors” are shown. Never state a price you have not confirmed: an empty price shows “Priced on request”.',
                initCollapsed: true,
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    text('name', { required: true, maxLength: 80, admin: { width: '50%' } }),
                    { name: 'kind', type: 'select', required: true, defaultValue: 'live-series', options: PROGRAM_KINDS.map((k) => ({ label: k.label, value: k.value })), admin: { width: '25%' } },
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
                area('description', { required: true, maxLength: 600, admin: { description: 'What it is, in plain words.' } }),
                list(
                  'levels',
                  [
                    text('name', { required: true, maxLength: 60 }),
                    text('description', { maxLength: 120 }),
                    text('price', { maxLength: 60, admin: { description: 'Only a price corporate support has confirmed. Empty shows “Priced on request”.' } }),
                  ],
                  { singular: 'Level', max: 8, description: 'Ways to partner.' },
                ),
                area('recognition', { maxLength: 400, admin: { description: 'Where a partner is named. Follows the credit guidelines. Empty says nothing.' } }),
                { name: 'pageUrl', type: 'text', label: 'Its page on this site', validate: validateSupportHref, admin: { description: 'For example /radiolive. Empty for no link.' } },
              ],
            },
          ],
        },
      ],
    },
  ],
}
