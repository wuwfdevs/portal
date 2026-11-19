import { actionsField, defineSection, sectionFields } from '../fields'

/**
 * Carpool plan (sponsor pages only): the two prices of the Carpool Plan, each with what it comes to a month. The prices are the Sponsorship
 * settings; the words around them and the button are this block's.
 */
export const Carpool = defineSection({
  slug: 'sectionCarpool',
  singular: 'Carpool plan',
  plural: 'Carpool plans',
  group: 'Collections',
  fields: sectionFields({
    own: [
      { name: 'perDayNote', type: 'text', admin: { description: 'Shown by the one-year price, e.g. "or about $4 a day".' } },
      { name: 'slotsNote', type: 'text' },
      actionsField({ maxRows: 1, description: 'One button, usually to the proposal form.' }),
    ],
  }),
})
