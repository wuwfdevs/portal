import { defineSection, sectionFields } from '../fields'
import { validateHref } from '@/lib/section-links'

/**
 * Giving levels (giving pages only): the membership levels as cards, lowest first, each with what it comes with and a link to the donation form at that
 * level. The levels (names, ranges, what each comes with, which one to lead with) and the form's address are the Giving settings, typed once; the words
 * around them are this block's. A level is a thank-you for a gift, never the thing being bought, and it never asks for payment details.
 */
export const GivingLevels = defineSection({
  slug: 'sectionGivingLevels',
  singular: 'Giving levels',
  plural: 'Giving levels',
  group: 'Collections',
  fields: sectionFields({
    own: [
      { name: 'buttonLabel', type: 'text', admin: { description: 'On each level’s card: “Give at this level”. Empty: no link on the cards.' } },
      { name: 'footnote', type: 'textarea', admin: { description: 'Small print under the cards.' } },
      { name: 'footnoteLinkLabel', type: 'text' },
      { name: 'footnoteLinkHref', type: 'text', label: 'Footnote link', validate: validateHref },
    ],
  }),
})
