import type { Access, ArrayField, Field, GlobalConfig, GroupField } from 'payload'

import { userCan } from '@/access/permissions'
import { area, group, heading, href as hrefField, list, num, section, text } from '@/globals/fieldBuilders'
import { revalidatePath, revalidateTag } from '@/lib/revalidate'
import { validateSupportHref } from '@/lib/support-link'

/** Membership staff manage what the pages offer; publishers and administrators can too. */
const canEdit: Access = ({ req }) => userCan(req.user, 'membership.manage') || userCan(req.user, 'content.publish')

/** A link address field whose hint shows this section's own pages. */
const href = (name: string, label?: string) => hrefField(name, label, '/support/ways')

/** A page's opening band: eyebrow, heading and the sentence or two under it. */
const opening = (extra: Field[] = []): GroupField => group('hero', [text('eyebrow'), text('title'), area('body', { admin: { description: 'Blank line between paragraphs.' } }), ...extra])

/** A section's eyebrow and heading, for sections whose heading has no sentence under it. */
const titled = (): Field[] => [text('eyebrow'), text('title')]

const line = (name: string, o: { max?: number; singular?: string; description?: string } = {}) =>
  list(name, [text('text', { required: true, maxLength: 300 })], { singular: o.singular ?? 'Line', plural: `${o.singular ?? 'Line'}s`, max: o.max ?? 8, description: o.description })

const card = (name: string, o: { max?: number; description?: string; link?: boolean } = {}) =>
  list(name, [text('title', { required: true }), area('text', { maxLength: 500 }), ...(o.link ? [href('href', 'Link address')] : [])], { singular: 'Card', max: o.max ?? 8, description: o.description })

const withRowLabel = (field: ArrayField, component: string): ArrayField => ({ ...field, admin: { ...field.admin, components: { RowLabel: component } } })

/** The levels list, with each row labelled by its name so an editor can scan the list. */
const levelsField = withRowLabel(
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
  '@/SupportPage/RowLabel#LevelRowLabel',
)

/**
 * The giving pages: Give (board 14), Other ways to give (14b), Leave a legacy (14c) and the thank-you page (14d). Every word, level,
 * amount and address on them is edited here, with a show/hide switch on each optional section; the migration that built this fills
 * it with the reviewed boards' wording. What stays in code is behaviour: which level a gift lands in, how the link to the donation
 * form is built, the markup.
 *
 * This is not the ledger and it never records a gift. A gift is made on WUWF's donation form; these pages describe the levels and
 * send the donor there with the amount and frequency they chose, when the form can take them.
 */
export const SupportPage: GlobalConfig = {
  slug: 'support-page',
  label: 'Giving pages',
  admin: { group: 'Pages & hubs', livePreview: { url: '/support' } },
  access: { read: () => true, update: canEdit },
  hooks: {
    afterChange: [
      ({ doc, req: { payload, context } }) => {
        if (!context.disableRevalidate) {
          payload.logger.info('Revalidating the giving pages')
          revalidateTag('global_support-page', 'max')
          revalidatePath('/support', 'layout')
        }
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
            area('serviceLine', {
              maxLength: 400,
              admin: { description: 'Printed at the foot of every giving page. Have the tax wording reviewed before it is published.' },
            }),
            group('nav', [text('title'), text('give'), text('legacy'), text('ways')], 'The “Ways to give” strip under the header, and the names of the three pages in it.'),
            group(
              'donationForm',
              [
                {
                  name: 'address',
                  type: 'text',
                  label: 'Donation form address',
                  validate: validateSupportHref,
                  admin: { description: 'WUWF’s own donation form, with the fund and the attribution code already in the address. Every Give button goes here. Empty: no Give button is shown and the pages say to call.' },
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
                text('notSetUp', {
                  maxLength: 300,
                  admin: { description: 'Shown instead of the Give button while there is no form address. {phone} becomes the number above.' },
                }),
              ],
              'Where a gift is made. This site never takes card, bank or payroll details.',
            ),
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
            levelsField,
            list('messageTiers', [num('yearly', { required: true, min: 1, admin: { description: 'In a year of giving, from this many dollars…' } }), num('count', { required: true, min: 1, max: 24, admin: { description: '…this many short messages on the air.' } })], {
              singular: 'Tier',
              max: 8,
              description: 'Day Sponsor messages by the year’s giving. A monthly gift counts 12 times; a one-time gift counts once.',
            }),
          ],
        },
        {
          label: 'Give page',
          fields: [
            group('give', [
              opening([line('assurances', { max: 4, description: 'The short lines under the opening text (tax-deductible, change or stop anytime, a phone number).' })]),
              group('card', [
                text('monthlyLabel'),
                text('monthlySub'),
                text('onceLabel'),
                text('onceSub'),
                list('monthlyAmounts', [num('amount', { required: true, min: 1 })], { singular: 'Amount', max: 10, description: 'The monthly amounts offered, in dollars.' }),
                list('onceAmounts', [num('amount', { required: true, min: 1 })], { singular: 'Amount', max: 10, description: 'The one-time amounts offered, in dollars.' }),
                num('monthlyDefault', { min: 1 }),
                num('onceDefault', { min: 1 }),
                text('otherLabel'),
                text('titleMonthly', { admin: { description: '“At {amount} a month”.' } }),
                text('titleOnce', { admin: { description: '“At {amount}”.' } }),
                text('messageOne', { admin: { description: 'The Day Sponsor line for one message: “A short personal message”.' } }),
                text('messageMany', { admin: { description: 'For several: “{count} short personal messages”.' } }),
                text('anyTitle'),
                line('anyBenefits', { max: 4 }),
                text('ctaMonthly', { admin: { description: '“Give {amount} a month”.' } }),
                text('ctaOnce', { admin: { description: '“Give {amount}”.' } }),
                text('ctaOther'),
                area('noteWithPrefill', { maxLength: 300, admin: { description: 'Under the button when the form takes the amount from the link.' } }),
                area('noteWithoutPrefill', { maxLength: 300, admin: { description: 'Under the button when it does not: the donor chooses the amount again on the form.' } }),
              ]),
              section('where', [...titled(), list('items', [text('heading', { required: true }), area('text', { maxLength: 500 })], { singular: 'Card', max: 4 }), text('closingLead', { maxLength: 300, admin: { description: 'The bold first sentence under the cards.' } }), area('closing', { maxLength: 500 })]),
              section('monthly', [...titled(), list('items', [text('heading', { required: true }), area('text', { maxLength: 500 })], { singular: 'Reason', max: 4 })]),
              section('levels', [...heading(), text('buttonLabel', { admin: { description: 'On each level’s card: “Give at this level”.' } }), area('footnote', { maxLength: 500 }), text('footnoteLinkLabel'), href('footnoteLinkHref', 'Footnote link address')]),
              section('more', [...titled(), card('items', { link: true, max: 8 })]),
              section('after', [...titled(), list('steps', [text('title', { required: true }), area('text', { maxLength: 500 })], { singular: 'Step', max: 5 }), text('linkLabel'), href('linkHref', 'Link address')]),
              section('fellowships', [
                ...heading(),
                text('buttonLabel'),
                href('buttonHref', 'Button address'),
                list('commitments', [text('heading', { required: true }), text('text', { required: true, maxLength: 300 })], { singular: 'Commitment', max: 6, description: 'What a funder can rely on. Only promise what WUWF does.' }),
              ]),
              section('businesses', [text('title'), area('text', { maxLength: 500 }), text('buttonLabel'), href('buttonHref', 'Button address')]),
              section('faq', [
                text('title'),
                list('items', [text('question', { required: true }), area('answer', { required: true, maxLength: 1200 })], { singular: 'Question', max: 12 }),
              ]),
            ]),
          ],
        },
        {
          label: 'Other ways to give',
          fields: [
            group('ways', [
              opening(),
              list(
                'groups',
                [
                  {
                    name: 'key',
                    type: 'select',
                    required: true,
                    options: [
                      { label: 'Vehicle or boat', value: 'vehicles' },
                      { label: 'Stock, IRA or fund', value: 'assets' },
                      { label: 'Through work', value: 'work' },
                      { label: 'In someone’s name', value: 'gift' },
                      { label: 'In your will', value: 'will' },
                    ],
                  },
                  text('label', { required: true }),
                  text('best', { admin: { description: 'Who it suits: “You have one to part with.”' } }),
                  text('effort', { admin: { description: 'How much it takes: “One phone call”.' } }),
                ],
                { singular: 'Choice', max: 5, description: 'The choices across the top of the page, in this order.' },
              ),
              list(
                'panels',
                [
                  {
                    name: 'group',
                    type: 'select',
                    required: true,
                    options: [
                      { label: 'Vehicle or boat', value: 'vehicles' },
                      { label: 'Stock, IRA or fund', value: 'assets' },
                      { label: 'Through work', value: 'work' },
                      { label: 'In someone’s name', value: 'gift' },
                      { label: 'In your will', value: 'will' },
                    ],
                  },
                  text('slug', { required: true, maxLength: 40, admin: { description: 'The word in the address (?way=stock): lowercase letters, no spaces.' } }),
                  text('tabLabel', { admin: { description: 'When a choice has several panels (Stock, IRA gift, Donor-advised fund), the name on its second row.' } }),
                  text('eyebrow'),
                  text('title'),
                  area('lead', { maxLength: 600 }),
                  text('buttonLabel'),
                  href('buttonHref', 'Button address'),
                  { name: 'showDetails', type: 'checkbox', label: 'Show the details to give a broker or fund', defaultValue: false },
                  line('steps', { description: 'How it works, in order.' }),
                  line('notes', { description: 'Good to know.' }),
                ],
                { singular: 'Panel', max: 12 },
              ),
              text('stepsTitle'),
              text('notesTitle'),
              group('details', [
                text('title'),
                text('copyLabel'),
                text('copiedLabel'),
                list('rows', [text('label', { required: true }), text('value', { required: true })], { singular: 'Row', max: 10 }),
                area('note', { maxLength: 400 }),
              ]),
              group('contact', [text('title'), area('text', { maxLength: 500 }), text('callLabel'), text('emailLabel')]),
            ]),
          ],
        },
        {
          label: 'Leave a legacy',
          fields: [
            group('legacy', [
              opening(),
              group('contactCard', [text('title'), area('text', { maxLength: 400 }), area('note', { maxLength: 300 }), text('callLabel'), text('emailLabel')]),
              section('routes', [...titled(), list('items', [text('tag'), text('title', { required: true }), area('text', { maxLength: 600 })], { singular: 'Way', max: 4 })]),
              section('sample', [...heading(), area('quote', { maxLength: 700 }), area('quoteNote', { maxLength: 300 })]),
              section('steps', [...titled(), list('items', [text('title', { required: true }), area('text', { maxLength: 500 })], { singular: 'Step', max: 6 })]),
              section('recognition', [text('eyebrow'), area('text', { maxLength: 500 })]),
              section('faq', [text('title'), list('items', [text('question', { required: true }), area('answer', { required: true, maxLength: 1200 })], { singular: 'Question', max: 12 })]),
            ]),
          ],
        },
        {
          label: 'Thank you',
          fields: [
            group(
              'thanks',
              [
                text('eyebrow'),
                text('title', { admin: { description: 'When the donation form sent no first name.' } }),
                text('titleNamed', { admin: { description: 'With one: “Thank you, {name}. You’re part of WUWF now.”' } }),
                area('body', { maxLength: 700, admin: { description: 'When the amount and frequency are not known.' } }),
                area('bodyMonthly', { maxLength: 700, admin: { description: '{amount} becomes the amount: “Your monthly gift of {amount} is how…”' } }),
                area('bodyOnce', { maxLength: 700 }),
                text('primaryLabel'),
                href('primaryHref', 'First button address'),
                text('secondaryLabel'),
                href('secondaryHref', 'Second button address'),
                text('nextTitle'),
                list('next', [text('lead', { required: true, maxLength: 60 }), text('text', { maxLength: 300 })], { singular: 'Step', max: 5, description: 'What happens next, with when it happens in bold: “This week.” “A note from the station.”' }),
                text('promptTitle'),
                text('promptLabel'),
                href('promptHref', 'Prompt link address'),
                section('while', [...titled(), card('items', { link: true, max: 6 })]),
                text('helpLine', { admin: { description: '“Questions about your gift? Call WUWF Member Services at {phone}.”' } }),
              ],
              'The page a donor lands on after giving. The donation form can send the first name, amount and frequency in the address (name, amount, frequency); nothing is stored.',
            ),
          ],
        },
      ],
    },
  ],
}
