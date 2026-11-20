import { defineSection, sectionFields } from '../fields'

/**
 * Fellowship feature: a fellowship's story and the funder line beside it, as the home page draws it (PAGE-BLOCKS.md → Home). The funder line comes from the fellowship's
 * underwriting agreements, never typed, and travels with the thing it funds: nobody places a sponsor's name next to a story it did not fund. The story is the one chosen,
 * else the fellowship's newest; on a page that does not repeat stories it takes it before any news run. Only the home set offers it.
 */
export const FellowshipFeature = defineSection({
  slug: 'sectionFellowshipFeature',
  singular: 'Fellowship feature',
  plural: 'Fellowship features',
  group: 'Lead',
  fields: sectionFields({
    heading: false,
    own: [
      { name: 'fellowship', type: 'relationship', relationTo: 'fellowships', required: true },
      { name: 'story', type: 'relationship', relationTo: 'posts', filterOptions: { _status: { equals: 'published' } }, admin: { description: 'The story to feature. Leave empty to feature the fellowship\'s newest.' } },
    ],
  }),
})
