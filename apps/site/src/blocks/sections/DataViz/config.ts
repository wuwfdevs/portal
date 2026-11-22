import { defineSection, sectionFields } from '../fields'

/**
 * Chart, map or table: one visualization from the data library, on a page. Like the same block in a story it holds a reference only, so the
 * figure, its data, caption and credit are kept once and every page that shows it follows. The band's heading is the section's own; the figure
 * carries its own title, and sits on its own white card so its colours are right on every tone.
 */
export const DataViz = defineSection({
  slug: 'sectionDataViz',
  singular: 'Chart, map or table',
  plural: 'Charts, maps and tables',
  group: 'Collections',
  fields: sectionFields({
    own: [
      {
        name: 'visualization',
        type: 'relationship',
        relationTo: 'visualizations',
        admin: { allowCreate: true, allowEdit: true, description: 'From the data library, or press + to make a new one here. Only a published visualization shows to readers; with none chosen, or one that cannot be drawn, the section draws nothing.' },
      },
    ],
  }),
})
