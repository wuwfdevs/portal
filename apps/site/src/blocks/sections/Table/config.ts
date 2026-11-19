import { defineSection, sectionFields } from '../fields'

/**
 * Table: typed rows only (PAGE-BLOCKS.md → Block catalogue). The on-air rate table is not this block: it lives in the estimator and
 * shares its selected row. One list inside the block: `columns` are column names, and each row's `cells` are its cells in order, the
 * first being the row's name. A row short of cells is padded with blanks; a cell past the last column is dropped.
 */
export const TABLE_VARIANTS = [
  { label: 'Rows: a table with a header row', value: 'rows' },
  { label: 'Pairs: each row is two cards side by side (two columns)', value: 'pairs' },
] as const

export const Table = defineSection({
  slug: 'sectionTable',
  singular: 'Table',
  plural: 'Tables',
  group: 'Facts and steps',
  fields: sectionFields({
    variants: TABLE_VARIANTS,
    own: [
      { name: 'columns', type: 'text', hasMany: true, required: true, minRows: 2, maxRows: 6, admin: { description: 'The column names, left to right. Press Enter after each. The first names the rows ("Daypart").' } },
      {
        name: 'rows',
        type: 'array',
        maxRows: 30,
        fields: [{ name: 'cells', type: 'text', hasMany: true, required: true, admin: { description: 'One entry per column, in order. Type a dash for an empty cell.' } }],
      },
      { name: 'caption', type: 'text', admin: { description: 'Optional: what the table shows, for a screen reader and under the table.' } },
    ],
  }),
})
