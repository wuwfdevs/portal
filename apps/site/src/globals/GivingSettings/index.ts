import type { Access, ArrayField, GlobalConfig } from 'payload'

import { userCan } from '@/access/permissions'
import { revalidateTag } from '@/lib/revalidate'
import { validateSupportHref } from '@/lib/support-link'

import { list, num, text, area } from '../fieldBuilders'

/** Membership staff manage what the pages offer; publishers and administrators can too (the giving set's own rule, `lib/page-sets/registry.ts`). */
const canEdit: Access = ({ req }) => userCan(req.user, 'membership.manage') || userCan(req.user, 'content.publish')

const line = (name: string, o: { max?: number; singular?: string; description?: string } = {}) =>
  list(name, [text('text', { required: true, maxLength: 300 })], { singular: o.singular ?? 'Line', plural: `${o.singular ?? 'Line'}s`, max: o.max ?? 8, description: o.description })

const withRowLabel = (field: ArrayField, component: string): ArrayField => ({ ...field, admin: { ...field.admin, components: { RowLabel: component } } })

/**
 * Giving settings (PAGE-BLOCKS.md → Shared data stays in globals). What the giving pages' blocks read: Member Services' contact details, the
 * donation form's addresses, the levels and what each comes with, the Day Sponsor message tiers, the amounts the gift card offers, and the details a
 * broker or fund needs. The words of a page (headings, paragraphs, button labels) are on its sections; **a level, an amount or an address is here, once**,
 * so one change reaches every page that shows it. The account page and every show's support page read the levels from here too.
 *
 * This is not the ledger and it never records a gift. A gift is made on WUWF's donation form; the pages describe the levels and send the donor there
 * with the amount and frequency they chose, when the form can take them.
 *
 * Blocks read this only through `getCachedGlobal` (tag `global_giving-settings`), so the save below reaches every page that holds one.
 */
export const GivingSettings: GlobalConfig = {
  slug: 'giving-settings',
  label: 'Giving settings',
  admin: { livePreview: { url: '/support' }, description: 'Levels, amounts, the donation form and Member Services’ contact details. The words on each giving page are on the page’s sections.' },
  access: { read: () => true, update: canEdit },
  hooks: {
    afterChange: [
      ({ doc, req: { context } }) => {
        if (!context.disableRevalidate) revalidateTag('global_giving-settings', 'max')
        return doc
      },
    ],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Contact and the form',
          fields: [
            text('phone', { admin: { description: 'WUWF Member Services, as people read it: 850 473-7433. Links are built from the digits.' } }),
            {
              name: 'email',
              type: 'email',
              label: 'Member Services email',
              admin: { description: 'A role address is best (people change; the address should not). Shown on the legacy and other-ways pages. Empty hides the Email buttons.' },
            },
            text('mailingAddress', { admin: { description: 'Where a check or a letter goes, on one line.' } }),
            area('serviceLine', { maxLength: 400, admin: { description: 'Printed at the foot of every giving page. Have the tax wording reviewed before it is published.' } }),
            {
              name: 'donationForm',
              type: 'group',
              admin: { description: 'Where a gift is made. This site never takes card, bank or payroll details.' },
              fields: [
                {
                  name: 'monthlyAddress',
                  type: 'text',
                  label: 'Monthly (sustaining) gift form',
                  validate: validateSupportHref,
                  admin: { description: 'WUWF’s form for a monthly gift, with the fund and attribution code already in the address. Every monthly Give button goes here.' },
                },
                {
                  name: 'onceAddress',
                  type: 'text',
                  label: 'One-time gift form',
                  validate: validateSupportHref,
                  admin: { description: 'WUWF’s form for a one-time gift. Every one-time Give button goes here.' },
                },
                {
                  name: 'address',
                  type: 'text',
                  label: 'Any other gift form',
                  validate: validateSupportHref,
                  admin: { description: 'Used for a gift that has no form of its own above (or for both, if WUWF has one form). With no address at all, no Give button is shown and the pages say to call.' },
                },
                {
                  name: 'prefill',
                  type: 'checkbox',
                  label: 'The form takes the amount and frequency from the link',
                  defaultValue: false,
                  admin: { description: 'Tick this only after testing that opening the form with the amount in the address really selects it (a first test with ?amount=20 did not). Off, the link carries neither and the page’s notes say so.' },
                },
                text('amountParam', { admin: { description: 'The name the form reads the amount from, e.g. amount. Letters, digits and _ - . only.' } }),
                text('frequencyParam', { admin: { description: 'The name the form reads monthly or one-time from, e.g. frequency.' } }),
                text('monthlyValue', { admin: { description: 'What it expects for a monthly gift. Empty sends “monthly”.' } }),
                text('onceValue', { admin: { description: 'What it expects for a one-time gift. Empty sends “once”.' } }),
                text('notSetUp', { maxLength: 300, admin: { description: 'Shown instead of the Give button while there is no form address. {phone} becomes the number above.' } }),
              ],
            },
            {
              name: 'membersListeningLevel',
              type: 'text',
              label: "Members' listening comes with",
              admin: {
                description:
                  "The qualifying level, in words, e.g. \"a sustaining membership of $10 a month or more\". Shown wherever the site explains members-only episodes (show support pages, the members' panel, a reader's account). One level for the whole station: no show has its own. Empty shows no level.",
              },
            },
          ],
        },
        {
          label: 'Levels',
          fields: [
            withRowLabel(
              list(
                'levels',
                [
                  text('name', { required: true }),
                  text('amount', { admin: { description: 'As shown above the name: “$10 a month or more”.' } }),
                  num('minimumMonthly', {
                    required: true,
                    min: 1,
                    admin: { description: 'The smallest monthly gift in this level, in whole dollars. A one-time gift is counted by the year against the same line (12 times this).' },
                  }),
                  area('description', { maxLength: 400, admin: { description: 'One plain sentence for pages that list the levels in passing (a show’s support page).' } }),
                  line('benefits', { description: 'On the level’s card on the Give page.' }),
                  line('giftBenefits', {
                    description: 'On the gift card when a gift lands in this level. A line may contain {messages}, which becomes the Day Sponsor line for that gift (and the line is left out when the gift earns none).',
                  }),
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
                {
                  singular: 'Level',
                  max: 8,
                  description: 'Lowest first or in any order; the page orders them by the monthly minimum. Perks are thanks for a gift, never the thing being bought, so describe them that way.',
                },
              ),
              '@/globals/GivingSettings/RowLabel#GivingLevelRowLabel',
            ),
            list(
              'messageTiers',
              [num('yearly', { required: true, min: 1, admin: { description: 'In a year of giving, from this many dollars…' } }), num('count', { required: true, min: 1, max: 24, admin: { description: '…this many short messages on the air.' } })],
              { singular: 'Tier', max: 8, description: 'Day Sponsor messages by the year’s giving. A monthly gift counts 12 times; a one-time gift counts once.' },
            ),
          ],
        },
        {
          label: 'Gift card amounts',
          fields: [
            list('monthlyAmounts', [num('amount', { required: true, min: 1 })], { singular: 'Amount', max: 10, description: 'The monthly amounts the gift card offers, in dollars.' }),
            list('onceAmounts', [num('amount', { required: true, min: 1 })], { singular: 'Amount', max: 10, description: 'The one-time amounts the gift card offers, in dollars.' }),
            num('monthlyDefault', { min: 1, admin: { description: 'The monthly amount chosen when the page opens. One of the amounts above; empty: the smallest.' } }),
            num('onceDefault', { min: 1, admin: { description: 'The one-time amount chosen when the page opens. Empty: the smallest.' } }),
          ],
        },
        {
          label: 'Details for a broker or fund',
          fields: [
            list('giftDetails', [text('label', { required: true }), text('value', { required: true })], {
              singular: 'Row',
              max: 10,
              description: 'What a donor hands a broker, a fund or an employer to give to WUWF: the legal name, the tax ID, the address. Shown on the Other ways page where a panel asks for it, with a Copy button.',
            }),
          ],
        },
      ],
    },
  ],
}
