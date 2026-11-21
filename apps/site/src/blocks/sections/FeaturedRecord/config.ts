import { defineSection, sectionFields } from '../fields'
import { FEATURE_RATIOS } from '../Feature/config'


export const FEATURED_VARIANTS = [
  { label: 'Hero: big headline, picture below', value: 'hero' },
  { label: 'Split: picture one side, words the other', value: 'split' },
] as const

/**
 * Featured record: leads with a story, an episode or a show that WUWF already has, instead of typed words (PAGE-BLOCKS.md → Block
 * catalogue). Its source is a record, so it is its own block and not a Feature variant. It reads the record at draw time (cached for ten
 * minutes: `lib/section-data/load.ts`), draws what the record says (its headline, line, picture and audio) and nothing else, and draws nothing
 * once the record is deleted or unpublished. Leads computed from a rule (RadioLive's next show, the Voyager and Unearthing leads) are the
 * phase 6 hub work and not built here.
 */
export const FeaturedRecord = defineSection({
  slug: 'sectionFeaturedRecord',
  singular: 'Featured record',
  plural: 'Featured records',
  group: 'Lead',
  fields: sectionFields({
    heading: false,
    variants: FEATURED_VARIANTS,
    own: [
      {
        name: 'mode',
        type: 'select',
        required: true,
        defaultValue: 'pick',
        options: [
          { label: 'A story, episode or show I pick', value: 'pick' },
          { label: 'The newest story of a section', value: 'newest' },
        ],
      },
      {
        name: 'record',
        type: 'relationship',
        relationTo: ['posts', 'productions'],
        admin: { description: 'A story or episode (episodes are stories with audio), or a show.', condition: (_, s) => s?.mode !== 'newest' },
      },
      { name: 'section', type: 'relationship', relationTo: 'sections', admin: { description: 'The newest published story filed under it.', condition: (_, s) => s?.mode === 'newest' } },
      { name: 'label', type: 'text', admin: { description: 'The line above the headline. Empty: "Story" or "Show".' } },
      { name: 'actionLabel', type: 'text', admin: { description: 'The button. Empty: "Read the story" or "See the show".' } },
      {
        name: 'ratio',
        type: 'select',
        defaultValue: 'standard',
        options: FEATURE_RATIOS.map((r) => ({ label: r.label, value: r.value })),
        admin: { description: 'Split only.', condition: (_, s) => s?.variant === 'split' },
      },
      {
        name: 'imageSide',
        type: 'select',
        defaultValue: 'right',
        options: [
          { label: 'Picture on the right', value: 'right' },
          { label: 'Picture on the left', value: 'left' },
        ],
        admin: { description: 'Split only.', condition: (_, s) => s?.variant === 'split' },
      },
    ],
  }),
})
