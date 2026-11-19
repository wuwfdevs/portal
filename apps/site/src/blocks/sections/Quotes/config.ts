import { defineSection, sectionFields } from '../fields'

/** Quotes: what people said, with who said it (PAGE-BLOCKS.md → Block catalogue). Plain text; no rich text. */
export const Quotes = defineSection({
  slug: 'sectionQuotes',
  singular: 'Quotes',
  plural: 'Quotes',
  group: 'Collections',
  fields: sectionFields({
    own: [
      {
        name: 'quotes',
        type: 'array',
        maxRows: 9,
        fields: [
          { name: 'quote', type: 'textarea', required: true, admin: { description: 'Without the quotation marks: the page adds them.' } },
          { name: 'name', type: 'text' },
          { name: 'role', type: 'text', admin: { description: 'A title, a business or a town: "Owner, Gulf Coast Hardware".' } },
        ],
      },
    ],
  }),
})
