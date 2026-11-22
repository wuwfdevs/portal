import type { Block } from 'payload'

/**
 * A chart, map or table from the Data library, placed in a story. It holds only a reference: the figure, its data, its caption and its credit
 * are the visualization's, so changing the visualization changes every story that shows it. Unpublished or unreadable, it draws nothing.
 */
export const DataViz: Block = {
  slug: 'dataViz',
  interfaceName: 'DataVizBlock',
  labels: { singular: 'Chart, map or table', plural: 'Charts, maps and tables' },
  fields: [
    {
      name: 'visualization',
      type: 'relationship',
      relationTo: 'visualizations',
      required: true,
      admin: { description: 'Choose one from the data library (Data & charts → Visualizations), or make a new one there first. Only a published visualization shows to readers.' },
    },
    {
      name: 'size',
      type: 'select',
      defaultValue: 'column',
      options: [
        { label: 'Story width', value: 'column' },
        { label: 'Wider than the text, on a large screen', value: 'wide' },
      ],
    },
  ],
}
