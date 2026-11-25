import { NEWS_RUN_COUNT, NEWS_RUN_VARIANTS, NEWS_ROW_COUNT } from '@/lib/homepage/modules'

import { defineSection, sectionFields } from '../fields'

/**
 * News run: a titled run of the newest stories of one section, each card the way the home page draws it, with a link to the section in the header (PAGE-BLOCKS.md → Home).
 * A section's run is every published story filed under it, whatever its source (Florida News is featured on purpose). On a page that does not repeat stories (the home set) it
 * takes the newest that nothing above took. Two layouts: `lead` (the first story on a row of its own, the rest below) and `row` (one row of three, no lead). Only the home and
 * Voyager sets offer it.
 */
export const NewsRun = defineSection({
  slug: 'sectionNewsRun',
  singular: 'News run',
  plural: 'News runs',
  group: 'Collections',
  fields: sectionFields({
    variants: NEWS_RUN_VARIANTS,
    own: [
      { name: 'section', type: 'relationship', relationTo: 'sections', required: true, admin: { description: 'Where its stories come from and where "More from…" goes.' } },
      { name: 'count', type: 'number', defaultValue: NEWS_RUN_COUNT.standard, min: NEWS_RUN_COUNT.min, max: NEWS_RUN_COUNT.max, admin: { description: `How many stories to show (${NEWS_RUN_COUNT.min} to ${NEWS_RUN_COUNT.max}). The first is the lead, on a row of its own; the rest sit below it. A one-row run always shows ${NEWS_ROW_COUNT}.`, condition: (_, s) => s?.variant !== 'row' } },
    ],
  }),
})
