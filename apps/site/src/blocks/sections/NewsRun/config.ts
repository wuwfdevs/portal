import { defineSection, sectionFields } from '../fields'

/**
 * News run: a titled run of the newest stories of one section, each card the way the home page draws it, with a link to the section in the header (PAGE-BLOCKS.md → Home).
 * A section's run is every published story filed under it, whatever its source (Florida News is featured on purpose). On a page that does not repeat stories (the home set) it
 * takes the newest that nothing above took, and the page's sponsor rows sit above each run. Only the home set offers it.
 */
export const NewsRun = defineSection({
  slug: 'sectionNewsRun',
  singular: 'News run',
  plural: 'News runs',
  group: 'Collections',
  fields: sectionFields({
    own: [
      { name: 'section', type: 'relationship', relationTo: 'sections', required: true, admin: { description: 'Where its stories come from and where "More from…" goes.' } },
      { name: 'count', type: 'number', defaultValue: 5, min: 3, max: 8, admin: { description: 'How many stories to show (3 to 8).' } },
    ],
  }),
})
