import type { GlobalConfig } from 'payload'

import { fieldRequires, requirePermission } from '@/access/permissions'
import { revalidatePath, revalidateTag } from '@/lib/revalidate'
import { PROGRAM_KINDS } from '@/lib/sponsorship/programs'
import { validateSupportHref } from '@/lib/support-link'

import { area, closing, group, hero, heading, href, list, num, section, source, stats, text } from './helpers'

/**
 * Sponsorship pages (boards 16 to 20b, /sponsor). Every word, price, figure and source line on those pages is edited here, with
 * a show/hide switch on each optional section. What stays in code is behaviour: the estimator's arithmetic, the form's validation
 * and the markup. The migration that creates this fills it with the reviewed boards' wording; nothing is hard-coded behind it.
 *
 * This is the public price list, not the ledger: no sponsor, contract or placement is held here. The deal lives in the Portal.
 */
export const Sponsorship: GlobalConfig = {
  slug: 'sponsorship',
  label: 'Sponsorship pages',
  admin: { group: 'Pages & hubs', livePreview: { url: '/sponsor' } },
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
            list('interests', [text('label', { required: true, maxLength: 80 })], { singular: 'Choice', max: 12, description: '“What are you interested in?” on the form.' }),
            list('budgets', [text('label', { required: true, maxLength: 60 })], { singular: 'Range', max: 8, description: 'The budget ranges, first one is the default.' }),
            group('example', [text('name'), text('line'), text('website')], 'The sample business used in illustrations. It is not a real sponsor and the pages say so.'),
            group('nav', [text('title'), text('hub'), text('onAir'), text('digital'), text('events'), text('audience'), text('guidelines')], 'The “For businesses” strip under the header, and the names of the six pages.'),
          ],
        },
        {
          label: 'Sponsor WUWF (hub)',
          fields: [
            group('hub', [
              hero([text('primaryLabel'), text('secondaryLabel')]),
              stats('heroStats', { max: 4 }),
              source('heroSource'),
              section('notAnAd', [...heading(), text('linkLabel'), list('items', [text('heading'), area('text')], { singular: 'Card', max: 4 }), source()]),
              section('goals', [
                ...heading(),
                list(
                  'items',
                  [
                    text('name', { required: true }),
                    text('title'),
                    area('lead'),
                    text('total'),
                    text('span', { maxLength: 300 }),
                    list('lines', [text('channel'), text('what'), area('detail', { maxLength: 400 }), text('price')], { singular: 'Line', max: 6 }),
                  ],
                  { singular: 'Goal', max: 10, description: 'Example schedules, not offers. Write each price as corporate support would quote it.' },
                ),
                text('looksLikeLabel'),
                text('ctaLabel'),
                group('eventsGoal', [text('name'), text('title'), text('lead'), text('total'), text('span'), text('linePrice')], 'The last goal is built from the events and programs that are open to sponsors (one line each). Leave its name empty to leave the goal out.'),
              ]),
              section('places', [
                ...heading(),
                list(
                  'items',
                  [
                    text('title'),
                    area('body', { maxLength: 400 }),
                    text('detail', { maxLength: 300 }),
                    text('price'),
                    { name: 'page', type: 'select', required: true, defaultValue: 'onAir', options: [{ label: 'On air', value: 'onAir' }, { label: 'Digital', value: 'digital' }, { label: 'Events and programs', value: 'events' }] },
                  ],
                  { singular: 'Card', max: 4 },
                ),
                text('noteTitle'),
                area('noteText', { maxLength: 400 }),
                text('noteLinkLabel'),
              ]),
              section('why', [...heading(), text('linkLabel'), stats('stats', { compare: true }), source()]),
              section('who', [...heading(), stats('stats', { max: 6 }), source(), text('linkLabel')]),
              section('testimonials', [...heading(), list('items', [area('quote', { maxLength: 800 }), text('name'), text('role')], { singular: 'Testimonial', max: 12 })]),
              section('faq', [...heading(), list('items', [text('question'), area('answer', { maxLength: 1000 }), text('linkLabel'), href('linkHref', 'Link address')], { singular: 'Question', max: 16 })]),
              section('inquiry', [...heading(), text('contactTitle'), text('submitLabel'), text('sendingLabel'), text('guidelinesNote'), text('guidelinesLink'), group('labels', [text('name'), text('organization'), text('email'), text('phone'), text('interests'), text('budget'), text('message'), text('required', { admin: { description: 'Read to screen readers after a required field’s name, e.g. “required”.' } })], 'The form’s field labels.'), text('thanksTitle'), text('notSetUpMessage', { admin: { description: 'Shown when the form cannot send because no address is set above. Include the phone number.' } }), text('failedMessage', { admin: { description: 'Shown when sending fails. Include the phone number.' } }), text('thanksPrefix', { admin: { description: 'Said before what they chose, e.g. “Here’s what you told us you’re interested in:”.' } })], { switchable: false }),
            ]),
          ],
        },
        {
          label: 'On air',
          fields: [
            group('onAir', [
              hero([area('quote', { maxLength: 500, admin: { description: 'A sample credit. Must follow the credit guidelines.' } }), text('quoteLabel'), area('quoteNote', { maxLength: 500 })]),
              section('credit', [...heading(), text('includesTitle'), area('includesText', { maxLength: 500 }), text('leavesTitle'), area('leavesText', { maxLength: 500 }), text('linkLabel')]),
              section('buy', [...heading(), list('items', [text('title'), area('text', { maxLength: 400 }), text('price'), { name: 'anchor', type: 'select', required: true, defaultValue: 'rates', options: ['rates', 'carpool', 'programs', 'packages'].map((v) => ({ label: v, value: v })) }], { singular: 'Option', max: 6 })]),
              section('rates', [
                ...heading(),
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
                  { singular: 'Daypart', max: 12, description: 'The rate card, one row per daypart. The estimator reads these numbers.' },
                ),
                list('creditCounts', [num('count', { required: true, min: 1 })], { singular: 'Count', max: 8, description: 'The schedule sizes the estimator offers.' }),
                num('prepayPercent', { min: 0, max: 100, admin: { description: 'Extra discount for prepaying a rate-card schedule.' } }),
                num('nonprofitPercent', { min: 0, max: 100, admin: { description: 'Nonprofit discount off open rates.' } }),
                area('note', { maxLength: 500 }),
                text('estimatorEyebrow'),
                text('estimatorTitle'),
                text('estimatorDisclaimer'),
                text('estimatorCta'),
                text('commitmentLabel'),
                text('creditsLabel'),
              ]),
              group('sharing', [text('title'), area('text', { maxLength: 500 })], 'The Sharing Spirit callout under the rate card.'),
              section('carpool', [
                ...heading(),
                num('words', { min: 1 }),
                num('sixMonths', { admin: { description: 'Dollars for six months.' } }),
                num('oneYear', { admin: { description: 'Dollars for a year.' } }),
                text('perDayNote', { admin: { description: 'Shown by the one-year price, e.g. “or about $4 a day”.' } }),
                text('slotsNote'),
                text('ctaLabel'),
              ]),
              section('programs', [...heading(), text('chooseLabel'), list('names', [text('name', { required: true })], { singular: 'Program', max: 20 })]),
              section('packages', [
                ...heading(),
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
                text('packageLabel', { admin: { description: 'Printed above each package number, e.g. “Package”.' } }),
                area('note', { maxLength: 500 }),
              ]),
              section('pay', [list('items', [text('heading'), text('text')], { singular: 'Line', max: 4 }), text('ctaTitle'), area('ctaText', { maxLength: 400 }), text('ctaLabel')]),
            ]),
          ],
        },
        {
          label: 'Digital',
          fields: [
            group('digital', [
              hero(),
              section('website', [...heading(), list('placements', [text('name'), area('detail', { maxLength: 400 }), text('size'), text('price')], { singular: 'Placement', max: 8 })]),
              section('app', [...heading(), list('placements', [text('name'), area('detail', { maxLength: 400 }), text('size'), text('price')], { singular: 'Placement', max: 8 }), text('illustrationNote')]),
              section('newsletter', [...heading(), list('placements', [text('name'), area('detail', { maxLength: 400 }), text('size'), text('price')], { singular: 'Placement', max: 8 })]),
              section('package', [text('eyebrow'), text('title'), area('body', { maxLength: 400 }), num('price', { admin: { description: 'Dollars a month.' } }), text('priceSuffix')]),
              section('rules', [...heading(), list('items', [text('heading'), area('text', { maxLength: 400 })], { singular: 'Rule', max: 8 })]),
              closing(),
            ]),
          ],
        },
        {
          label: 'Events and programs',
          fields: [
            group('events', [
              hero(),
              section('showUp', [text('title'), stats('stats', { max: 4 }), source(), text('linkLabel')]),
              section('open', [text('eyebrow'), text('titleOne', { admin: { description: 'Heading with one program open.' } }), text('titleTwo', { admin: { description: 'With two.' } }), text('titleMany', { admin: { description: 'With more.' } }), area('emptyText', { maxLength: 400, admin: { description: 'Shown when no program is open.' } }), text('talkLabel', { admin: { description: 'Button text; {name} becomes the program’s name.' } }), text('moreLabel', { admin: { description: 'Link text; {name} becomes the program’s name.' } }), text('levelsLabel'), text('recognitionLabel')], { switchable: false }),
              section('every', [text('eyebrow'), text('title'), list('items', [text('heading'), area('text', { maxLength: 300 })], { singular: 'Item', max: 6 }), area('note', { maxLength: 400 })]),
              closing(),
            ]),
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
                area('description', { required: true, maxLength: 600, admin: { description: 'What it is, in plain words. The first sentence is also its summary on the goal picker.' } }),
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
        {
          label: 'Audience',
          fields: [
            group('audience', [
              hero(),
              section('wuwf', [...heading(), stats('stats', { max: 6 }), source()]),
              section('small', [...heading(), stats('stats', { max: 12 }), text('skepticalTitle'), stats('skeptical', { max: 8 }), source()]),
              section('halo', [...heading(), stats('stats', { max: 8 }), text('compareTitle'), text('nprLabel'), text('commercialLabel'), list('comparison', [text('label', { maxLength: 300 }), num('npr', { max: 100 }), num('commercial', { max: 100 })], { singular: 'Statement', max: 8 }), area('caveat', { maxLength: 1200 }), source()]),
              section('national', [...heading(), stats('stats', { max: 8 }), source(), text('glanceTitle'), stats('glance', { max: 8 }), source('glanceSource')]),
              section('sectors', [
                ...heading(),
                list(
                  'items',
                  [text('name', { required: true }), text('short'), text('title', { maxLength: 300 }), area('lead', { maxLength: 400 }), stats('local', { max: 6 }), stats('national', { max: 6 })],
                  { singular: 'Sector', max: 12 },
                ),
                text('localLabel'),
                text('nationalLabel'),
                text('talkLabel', { admin: { description: 'Button text; {short} becomes the sector’s short name.' } }),
                source(),
              ]),
              closing(),
            ]),
          ],
        },
        {
          label: 'Credit guidelines',
          fields: [
            group(
              'guidelines',
              [
                hero(),
                section('includes', [text('eyebrow'), text('title'), list('items', [text('text', { maxLength: 300 })], { singular: 'Item', max: 12 })]),
                section('leavesOut', [text('eyebrow'), text('title'), list('items', [text('heading'), text('examples', { maxLength: 300 })], { singular: 'Item', max: 20 })]),
                section('side', [...heading(), text('adLabel'), text('creditLabel'), list('pairs', [area('ad', { maxLength: 400 }), area('credit', { maxLength: 400 })], { singular: 'Pair', max: 6 })]),
                section('rules', [text('eyebrow'), text('title'), list('items', [text('heading'), area('text', { maxLength: 500 })], { singular: 'Rule', max: 12 }), source()]),
                closing(),
              ],
              'The final wording is for WUWF and the University of West Florida to approve before launch.',
            ),
          ],
        },
      ],
    },
  ],
}
