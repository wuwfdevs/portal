import { defineSection, sectionFields } from '../fields'

/**
 * Show spotlight: one WUWF original with its newest episode to play here, its funder line, and more shows beside it, as the home page's podcasts section draws it
 * (PAGE-BLOCKS.md → Home). Only shows listed in the podcast directory appear. Editors may pick the show; empty, the show with the newest episode is featured. Draws nothing
 * while no listed show has an episode. The funder line comes from the show's agreements. Only the home set offers it.
 */
export const ShowSpotlight = defineSection({
  slug: 'sectionShowSpotlight',
  singular: 'Show spotlight',
  plural: 'Show spotlights',
  group: 'Collections',
  fields: sectionFields({
    own: [
      {
        name: 'featuredShow',
        type: 'relationship',
        relationTo: 'productions',
        filterOptions: { and: [{ kind: { equals: 'original' } }, { listed: { equals: true } }] },
        admin: { description: 'Optional. The show to feature. Leave empty to feature the show with the newest episode.' },
      },
    ],
  }),
})
