import type { Access, GlobalConfig } from 'payload'

import { userCan } from '@/access/permissions'
import { validateSupportHref } from '@/lib/support-link'
import { revalidateSupportPage } from './hooks/revalidateSupportPage'

/** Membership staff manage what the page offers; publishers and administrators can too. */
const canEdit: Access = ({ req }) => userCan(req.user, 'membership.manage') || userCan(req.user, 'content.publish')

const hrefField = (name: string, label: string, description?: string) =>
  ({
    name,
    type: 'text',
    label,
    validate: validateSupportHref,
    admin: {
      description:
        description ??
        'A page on this site (/shows/barefoot-mary), a secure https:// address, or mailto:. Leave empty and the button is not shown.',
    },
  }) as const

/**
 * The giving page (`/support`, board 14). Everything on it is edited here: the levels of support, the figures, the
 * calls to action. Gifts are made on WUWF's donation form; this page only describes the levels and links there, it
 * is not the ledger and it never records a gift.
 */
export const SupportPage: GlobalConfig = {
  slug: 'support-page',
  label: 'Support page',
  access: { read: () => true, update: canEdit },
  hooks: { afterChange: [revalidateSupportPage] },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Top of page',
          fields: [
            { name: 'eyebrow', type: 'text', defaultValue: 'Support WUWF' },
            {
              name: 'heading',
              type: 'text',
              admin: { description: 'The opening statement. Leave empty to show the page without one.' },
            },
            {
              name: 'figures',
              type: 'array',
              maxRows: 4,
              labels: { singular: 'Figure', plural: 'Figures' },
              admin: {
                description:
                  'Up to four true, current numbers (listeners, readers, years on air). Only add one WUWF can source; an empty list shows none.',
                initCollapsed: true,
              },
              fields: [
                { name: 'value', type: 'text', required: true, admin: { description: 'For example 1981 or 48,000.' } },
                { name: 'label', type: 'text', required: true, admin: { description: 'For example on the air since.' } },
              ],
            },
          ],
        },
        {
          label: 'Levels of support',
          fields: [
            { name: 'levelsEyebrow', type: 'text', defaultValue: 'For listeners and readers' },
            { name: 'levelsHeading', type: 'text', defaultValue: 'One spectrum of support' },
            {
              name: 'levels',
              type: 'array',
              maxRows: 8,
              labels: { singular: 'Level', plural: 'Levels' },
              admin: {
                description:
                  'Member, Sustaining, Day Sponsor, Crystal Circle, Legacy. Shown left to right in this order. Perks are thanks for a gift, never the thing being bought, so describe them that way.',
                components: { RowLabel: '@/SupportPage/RowLabel#LevelRowLabel' },
              },
              fields: [
                { name: 'name', type: 'text', required: true },
                {
                  name: 'amount',
                  type: 'text',
                  admin: { description: 'As shown above the name: From $5/mo, $8+/mo, In your will.' },
                },
                { name: 'description', type: 'textarea', required: true, maxLength: 400 },
                { name: 'ctaLabel', type: 'text', label: 'Button text', admin: { description: 'Join, Sustain, Talk with us.' } },
                hrefField(
                  'ctaUrl',
                  'Button address',
                  'Where the button goes: WUWF\'s donation form (with the right fund), or a contact address for planned gifts. Empty hides the button.',
                ),
                {
                  name: 'emphasis',
                  type: 'select',
                  defaultValue: 'standard',
                  options: [
                    { label: 'Standard', value: 'standard' },
                    { label: 'Featured (the level to lead with)', value: 'featured' },
                    { label: 'Leadership', value: 'leadership' },
                  ],
                },
              ],
            },
            {
              name: 'otherWays',
              type: 'textarea',
              label: 'Other ways to give',
              admin: { description: 'One short line under the levels (vehicle and property gifts, the Combined Federal Campaign number).' },
            },
          ],
        },
        {
          label: 'Businesses',
          fields: [
            { name: 'showBusinesses', type: 'checkbox', label: 'Show this section', defaultValue: true },
            { name: 'businessesEyebrow', type: 'text', defaultValue: 'For businesses and organizations' },
            { name: 'businessesHeading', type: 'text', defaultValue: 'Sponsor WUWF' },
            { name: 'businessesBody', type: 'textarea' },
            { name: 'businessesPrimaryLabel', type: 'text', label: 'First button text' },
            hrefField('businessesPrimaryUrl', 'First button address'),
            { name: 'businessesSecondaryLabel', type: 'text', label: 'Second button text' },
            hrefField('businessesSecondaryUrl', 'Second button address'),
          ],
        },
        {
          label: 'Fellowships',
          fields: [
            { name: 'showFellowships', type: 'checkbox', label: 'Show this section', defaultValue: true },
            { name: 'fellowshipsEyebrow', type: 'text', defaultValue: 'Philanthropy' },
            { name: 'fellowshipsHeading', type: 'text', defaultValue: 'Fund a reporting fellowship or series' },
            { name: 'fellowshipsBody', type: 'textarea' },
            { name: 'fellowshipsLinkLabel', type: 'text', label: 'Button text' },
            hrefField('fellowshipsLinkUrl', 'Button address', 'Usually an example fellowship, such as /fellowships/coastal-futures.'),
            {
              name: 'commitments',
              type: 'array',
              maxRows: 6,
              labels: { singular: 'Commitment', plural: 'Commitments' },
              admin: {
                description:
                  'What a funder can rely on (WUWF decides, you are acknowledged, no review, reporting back). Only promise what WUWF does.',
                initCollapsed: true,
              },
              fields: [
                { name: 'heading', type: 'text', required: true },
                { name: 'text', type: 'text', required: true },
              ],
            },
          ],
        },
        {
          label: 'Footer note',
          fields: [
            {
              name: 'giftNotice',
              type: 'textarea',
              admin: {
                description:
                  'The line at the foot of the page, for example that the station is a service of the University of West Florida and that gifts are tax-deductible as allowed by law. Have it reviewed before it is published.',
              },
            },
          ],
        },
      ],
    },
  ],
}
