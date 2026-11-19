import { validateHref } from '@/lib/section-links'

import { defineSection, sectionFields } from '../fields'

/** Questions: questions and answers that open one at a time (PAGE-BLOCKS.md → Block catalogue). Plain text answers, no rich text. */
export const Questions = defineSection({
  slug: 'sectionQuestions',
  singular: 'Questions',
  plural: 'Questions',
  group: 'Facts and steps',
  fields: sectionFields({
    own: [
      {
        name: 'items',
        type: 'array',
        maxRows: 30,
        fields: [
          { name: 'question', type: 'text', required: true },
          { name: 'answer', type: 'textarea', required: true, admin: { description: 'A blank line starts a new paragraph.' } },
          { name: 'linkLabel', type: 'text' },
          { name: 'linkHref', type: 'text', label: 'Link', validate: validateHref },
        ],
      },
    ],
  }),
})
