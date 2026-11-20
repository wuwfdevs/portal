import { defineSection, sectionFields } from '../fields'

/**
 * Feature panels: RadioLive (the next show and the newest recorded set) and Unearthing Florida (one episode, playable here) side by side, as the home page draws them
 * (PAGE-BLOCKS.md → Home). Each is left out while it has nothing to show, and the block draws nothing when both are. RadioLive's panel carries no funder line, as on the show
 * pages: only the RadioLive page does, so a night is never credited to a sponsor who did not fund it. Only the home set offers it.
 */
export const FeaturePanels = defineSection({
  slug: 'sectionFeaturePanels',
  singular: 'Feature panels',
  plural: 'Feature panels',
  group: 'Collections',
  fields: sectionFields({
    heading: false,
    own: [
      { name: 'radioLive', type: 'checkbox', defaultValue: true, label: 'Show the RadioLive panel' },
      { name: 'unearthing', type: 'checkbox', defaultValue: true, label: 'Show the Unearthing Florida panel' },
      {
        name: 'unearthingEpisode',
        type: 'relationship',
        relationTo: 'posts',
        filterOptions: { _status: { equals: 'published' } },
        admin: { description: 'Optional. An Unearthing Florida episode to feature. Empty: the episode featured on the Unearthing Florida page, else the newest. A story from another series is ignored.', condition: (_, s) => s?.unearthing !== false },
      },
    ],
  }),
})
