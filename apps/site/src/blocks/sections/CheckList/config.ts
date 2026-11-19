import { defineSection, sectionFields } from '../fields'

const markField = (name: string) => ({
  name,
  type: 'select' as const,
  defaultValue: 'check',
  options: [
    { label: 'A tick', value: 'check' },
    { label: 'A cross (leaves out)', value: 'cross' },
    { label: 'A dot', value: 'dot' },
  ],
})

/**
 * Check list: short lines with a mark each (board 28's "A credit includes" beside "A credit leaves out"). A second list, with its own title and
 * mark, sits beside the first on a wide screen and under it on a phone. One level of list inside each.
 */
export const CheckList = defineSection({
  slug: 'sectionCheckList',
  singular: 'Check list',
  plural: 'Check lists',
  group: 'Facts and steps',
  fields: sectionFields({
    own: [
      { name: 'listTitle', type: 'text', admin: { description: 'Optional: a title over the list, e.g. "A credit includes".' } },
      markField('mark'),
      { name: 'items', type: 'array', maxRows: 20, fields: [{ name: 'text', type: 'text', required: true }, { name: 'detail', type: 'text', admin: { description: 'Optional: a smaller line under it, e.g. examples.' } }] },
      {
        name: 'second',
        type: 'group',
        label: 'A second list, beside the first',
        admin: { description: 'Optional.' },
        fields: [
          { name: 'title', type: 'text', admin: { description: 'e.g. "A credit leaves out".' } },
          markField('mark'),
          { name: 'items', type: 'array', maxRows: 20, fields: [{ name: 'text', type: 'text', required: true }, { name: 'detail', type: 'text' }] },
        ],
      },
    ],
  }),
})
