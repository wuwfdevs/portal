import { defineSection, sectionFields } from '../fields'

/**
 * Illustration (inside Columns only): a small drawing of where something sits, such as a sample sponsor message in a dashed box
 * ("Illustration · display ad"). Not a picture and not real: it says so in its label, it is hidden from a screen reader (the table beside it says
 * everything it does), and the sponsor in it is an invented one.
 */
export const Illustration = defineSection({
  slug: 'sectionIllustration',
  singular: 'Illustration',
  plural: 'Illustrations',
  group: 'Layout',
  fields: sectionFields({
    heading: false,
    own: [
      { name: 'label', type: 'text', required: true, admin: { description: 'What it shows, e.g. "Illustration · display ad".' } },
      { name: 'caption', type: 'text', admin: { description: 'The small label on the sample, e.g. "Sponsor message".' } },
      { name: 'name', type: 'text', admin: { description: 'The sample sponsor’s name. Not a real sponsor.' } },
      { name: 'line', type: 'text', admin: { description: 'One line about the sample sponsor.' } },
      { name: 'website', type: 'text', admin: { description: 'The sample address, as text (it is not a link).' } },
    ],
  }),
})
