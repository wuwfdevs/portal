import { defineSection, moreLinkFields, sectionFields } from '../fields'

export const STATS_VARIANTS = [
  { label: 'Tiles: one big number each', value: 'tiles' },
  { label: 'Compare: two numbers side by side, with bars', value: 'compare' },
] as const

/**
 * Stats: figures with a source line (PAGE-BLOCKS.md → Block catalogue; the source is required, so a figure never stands alone). `tiles`
 * and `compare` are layouts over the same rows; the compare layout also reads the two group names, and ignores them in tiles.
 */
export const Stats = defineSection({
  slug: 'sectionStats',
  singular: 'Stats',
  plural: 'Stats',
  group: 'Facts and steps',
  fields: sectionFields({
    variants: STATS_VARIANTS,
    own: [
      {
        name: 'stats',
        type: 'array',
        maxRows: 12,
        fields: [
          { name: 'value', type: 'text', required: true, admin: { description: 'The figure as it should read: "22,500", "79%".' } },
          { name: 'text', type: 'text', required: true, admin: { description: 'What it counts: "listen in a typical week".' } },
          { name: 'compare', type: 'text', admin: { description: 'Compare: the second figure ("43%"). Tiles: an optional line under the figure ("43% of non-listeners say the same").' } },
        ],
      },
      { name: 'valueLabel', type: 'text', admin: { description: 'Compare only: who the first figure is about ("NPR listeners").', condition: (_, s) => s?.variant === 'compare' } },
      { name: 'compareLabel', type: 'text', admin: { description: 'Compare only: who the second figure is about ("Non-listeners").', condition: (_, s) => s?.variant === 'compare' } },
      ...moreLinkFields(),
      { name: 'source', type: 'text', required: true, admin: { description: 'Where the figures come from and what they are a share of: "Nielsen Audio, Pensacola metro, Spring 2026."' } },
    ],
  }),
})
