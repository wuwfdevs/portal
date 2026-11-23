import { validateHref } from '@/lib/section-links'

import { defineSection, sectionFields } from '../fields'

/**
 * Show spotlight: one WUWF original with its newest episode to play here, its funder line, and more shows beside it, as the home page's podcasts section draws it
 * (PAGE-BLOCKS.md → Home). Only shows listed in the podcast directory appear. Editors may pick the show; empty, the show with the newest episode is featured. Draws nothing
 * while no listed show has an episode. The funder line comes from the show's agreements. The home set and The Voyager's offer it; with **Only these shows** set it draws from
 * those shows alone (The Voyager's student-made shows), and on a Voyager page it draws nothing until some are chosen, so the station's podcasts never appear under the student newspaper's name.
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
      {
        name: 'onlyShows',
        type: 'relationship',
        relationTo: 'productions',
        hasMany: true,
        filterOptions: { and: [{ kind: { equals: 'original' } }, { listed: { equals: true } }] },
        label: 'Only these shows',
        admin: { description: 'Optional. Draw only these shows (the featured one and the list beside it). Empty draws every listed show; on The Voyager\'s pages, empty draws nothing.' },
      },
      { name: 'moreLabel', type: 'text', admin: { description: 'Optional. The link at the top right. Empty: "All podcasts", to the podcast directory.' } },
      { name: 'moreHref', type: 'text', label: 'More link', validate: validateHref },
    ],
  }),
})
