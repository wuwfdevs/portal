import { defineSection, sectionFields } from '../fields'

/**
 * Credit: the underwriting line for a production, fellowship or series, drawn from its agreement record in the neutral panel the credit
 * rules require (PAGE-BLOCKS.md → Block catalogue; CLAUDE.md → Underwriting rules). It names the record because a page has none of its own.
 * Nobody types a sponsor's name here: the words come from the agreement, so changing the agreement changes every page. It shows lines only
 * for a running agreement, and nothing otherwise. The panel is its own neutral surface on any tone, never a sponsor's colours.
 */
export const Credit = defineSection({
  slug: 'sectionCredit',
  singular: 'Credit',
  plural: 'Credits',
  group: 'Action',
  fields: sectionFields({
    heading: false,
    own: [
      {
        name: 'target',
        type: 'relationship',
        relationTo: ['productions', 'fellowships', 'series'],
        required: true,
        admin: { description: 'Whose acknowledgment to show: the line comes from its underwriting agreement. A page that is not one of these has no credit here.' },
      },
    ],
  }),
})
