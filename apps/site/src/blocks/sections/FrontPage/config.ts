import { defineSection, sectionFields } from '../fields'

const publishedOnly = { _status: { equals: 'published' } }

/**
 * Front page lead: the lead story's band and The Briefing, as the home page draws them (PAGE-BLOCKS.md → Home). Editors may choose the lead and up to five top stories; any
 * left empty are filled from the newest of WUWF's own work, so the block is never blank and never needs a story picked to stay current. On a page that does not repeat stories
 * (the home set) it takes its stories first, so no news run below shows them again. Only the home set offers it.
 */
export const FrontPage = defineSection({
  slug: 'sectionFrontPage',
  singular: 'Front page lead',
  plural: 'Front page leads',
  group: 'Lead',
  fields: sectionFields({
    heading: false,
    own: [
      { name: 'lead', type: 'relationship', relationTo: 'posts', filterOptions: publishedOnly, admin: { description: 'The large story. Leave empty to lead with the newest story of WUWF\'s own.' } },
      { name: 'leadKicker', type: 'text', admin: { description: 'Optional small label above the headline, e.g. "After Isaias". Empty: the story\'s section.' } },
      {
        name: 'topStories',
        type: 'relationship',
        relationTo: 'posts',
        hasMany: true,
        maxRows: 5,
        filterOptions: publishedOnly,
        admin: { description: 'Up to five, in the order shown under the lead. Any left empty are filled with the newest stories.' },
      },
    ],
  }),
})
