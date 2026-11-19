import { defineSection, sectionFields } from '../fields'

const text = (name: string, description?: string) => ({ name, type: 'text' as const, ...(description ? { admin: { description } } : {}) })

/**
 * Gift card (giving pages only): the Give page's opening band, the words on the left and the gift card on the right (board 14). The card is how often,
 * how much and what that comes to, and one button to WUWF's donation form. **It takes nothing**: no card, bank or payroll detail is asked for here, ever.
 * The amounts, the levels and the form's address are the Giving settings (typed once, in one place); the words around them are this block's.
 */
export const GiftCard = defineSection({
  slug: 'sectionGiftCard',
  singular: 'Gift card',
  plural: 'Gift cards',
  group: 'Action',
  fields: sectionFields({
    heading: false,
    own: [
      { name: 'label', type: 'text', admin: { description: 'A short line above the headline: "Give to WUWF".' } },
      { name: 'headline', type: 'text', required: true },
      { name: 'line', type: 'textarea', admin: { description: 'One or two sentences under the headline. A blank line starts a new paragraph.' } },
      {
        name: 'assurances',
        type: 'array',
        maxRows: 4,
        admin: { description: 'The short lines under the opening text (tax-deductible, change or stop anytime, a phone number).' },
        fields: [{ name: 'text', type: 'text', required: true, maxLength: 300 }],
      },
      {
        name: 'card',
        type: 'group',
        admin: { description: 'The words on the gift card. The amounts it offers, its levels and where it sends a gift are in Giving settings.' },
        fields: [
          text('monthlyLabel'),
          text('monthlySub'),
          text('onceLabel'),
          text('onceSub'),
          text('otherLabel'),
          text('titleMonthly', '“At {amount} a month”.'),
          text('titleOnce', '“At {amount}”.'),
          text('messageOne', 'The Day Sponsor line for one message: “A short personal message”.'),
          text('messageMany', 'For several: “{count} short personal messages”.'),
          text('anyTitle'),
          { name: 'anyBenefits', type: 'array', maxRows: 4, fields: [{ name: 'text', type: 'text', required: true, maxLength: 300 }] },
          text('ctaMonthly', '“Give {amount} a month”.'),
          text('ctaOnce', '“Give {amount}”.'),
          text('ctaOther'),
          { name: 'noteWithPrefill', type: 'textarea', maxLength: 300, admin: { description: 'Under the button when the donation form takes the amount from the link.' } },
          { name: 'noteWithoutPrefill', type: 'textarea', maxLength: 300, admin: { description: 'Under the button when it does not: the donor chooses the amount again on the form.' } },
        ],
      },
    ],
  }),
})
