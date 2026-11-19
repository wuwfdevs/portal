import { defineSection, sectionFields } from '../fields'

export const STEPS_VARIANTS = [
  { label: 'Grid: a large numeral each', value: 'grid' },
  { label: 'List: compact, numbered', value: 'list' },
] as const

/** Steps: what happens, in order (PAGE-BLOCKS.md → Block catalogue). An ordered list, so the numbers are real. */
export const Steps = defineSection({
  slug: 'sectionSteps',
  singular: 'Steps',
  plural: 'Steps',
  group: 'Facts and steps',
  fields: sectionFields({
    variants: STEPS_VARIANTS,
    own: [
      {
        name: 'steps',
        type: 'array',
        maxRows: 8,
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'text', type: 'textarea' },
        ],
      },
    ],
  }),
})
