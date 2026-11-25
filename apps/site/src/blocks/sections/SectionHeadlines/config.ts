import { defineSection, sectionFields } from '../fields'

/** How many headlines a column shows, and how many sections the block holds. */
export const HEADLINES_COUNT = { min: 3, max: 6, standard: 4 } as const
export const HEADLINES_SECTIONS = { min: 1, max: 3 } as const

/**
 * More by section: the newest headlines of up to three sections, one column each, text only (the homepage rethink, 2026-11-25). The sections past the page's main runs
 * (Local Politics, Local Arts, UWF News) end the news here at a fraction of a run's height. Each column is headed by its section, which links to the section's page; the
 * band's "more" link goes to every story. On the home set it takes part in the page's ordered pass, so a headline is never a story already shown above it.
 */
export const SectionHeadlines = defineSection({
  slug: 'sectionHeadlines',
  singular: 'More by section',
  plural: 'More by section',
  group: 'Collections',
  fields: sectionFields({
    own: [
      {
        name: 'sections',
        type: 'relationship',
        relationTo: 'sections',
        hasMany: true,
        required: true,
        minRows: HEADLINES_SECTIONS.min,
        maxRows: HEADLINES_SECTIONS.max,
        admin: { description: `Up to three sections (two or three is usual), one column each, in this order. Each column's title links to its section's page.` },
      },
      {
        name: 'count',
        type: 'number',
        defaultValue: HEADLINES_COUNT.standard,
        min: HEADLINES_COUNT.min,
        max: HEADLINES_COUNT.max,
        admin: { description: `How many headlines in each column (${HEADLINES_COUNT.min} to ${HEADLINES_COUNT.max}).` },
      },
    ],
  }),
})
