import { validateHref } from '@/lib/section-links'

import { defineSection, sectionFields } from '../fields'

/**
 * Cards: hand-typed cards, each with a title, text, an optional link, tag or price (PAGE-BLOCKS.md → Block catalogue). One level of
 * list, no rich text (so no restricted block can be put in a card). The first block of the library, and the pattern the others follow.
 */
export const Cards = defineSection({
  slug: 'sectionCards',
  singular: 'Cards',
  plural: 'Cards',
  group: 'Collections',
  fields: sectionFields({
    own: [
      {
        name: 'cards',
        type: 'array',
        maxRows: 12,
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'text', type: 'textarea' },
          { name: 'tag', type: 'text', admin: { description: 'A short label above the title, e.g. "On air".' } },
          { name: 'price', type: 'text', admin: { description: 'Typed as it should read, e.g. "From $23 a credit". Prices that change live in a settings page, not here.' } },
          { name: 'href', type: 'text', label: 'Link', validate: validateHref },
          { name: 'linkLabel', type: 'text', admin: { description: 'The words on the link. Empty: "Read more".' } },
        ],
      },
    ],
  }),
})
