import { defineSection, sectionFields } from '../fields'

/** Check list: short lines with a mark each. Two lists ("a credit includes", "a credit leaves out") are two blocks (one level of list per block). */
export const CheckList = defineSection({
  slug: 'sectionCheckList',
  singular: 'Check list',
  plural: 'Check lists',
  group: 'Facts and steps',
  fields: sectionFields({
    own: [
      {
        name: 'mark',
        type: 'select',
        defaultValue: 'check',
        options: [
          { label: 'A tick', value: 'check' },
          { label: 'A cross (leaves out)', value: 'cross' },
          { label: 'A dot', value: 'dot' },
        ],
      },
      { name: 'items', type: 'array', maxRows: 20, fields: [{ name: 'text', type: 'text', required: true }] },
    ],
  }),
})
