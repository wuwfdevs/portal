import type { Field } from 'payload'

/** How a number is written: one group, used by every engine that shows numbers, so the choices are the same everywhere. */
export const valueFormatField = (name: string, label: string, description?: string): Field => ({
  name,
  type: 'group',
  label,
  admin: { description },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'style',
          type: 'select',
          defaultValue: 'number',
          options: [
            { label: 'Number (1,234)', value: 'number' },
            { label: 'Percent (the data is a fraction: 0.25 shows 25%)', value: 'percent' },
            { label: 'Dollars ($1,234)', value: 'currency' },
          ],
          admin: { width: '50%' },
        },
        { name: 'decimals', type: 'number', min: 0, max: 6, admin: { width: '25%', description: 'Digits after the point. Blank: as needed.' } },
        { name: 'compact', type: 'checkbox', defaultValue: false, admin: { width: '25%', description: 'Short form: 1.2M. Axes and legends only.' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'prefix', type: 'text', admin: { width: '50%', description: 'Before the number, for a plain number: "~"' } },
        { name: 'suffix', type: 'text', admin: { width: '50%', description: 'After the number, for a plain number: " cases"' } },
      ],
    },
  ],
})
