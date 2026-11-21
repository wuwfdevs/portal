import { actionsField, defineSection, sectionFields } from '../fields'

/**
 * Closing band: an invitation to do one thing, ending a page (board 28's "Call to action · buttons"). Buttons only. A form is not here:
 * a form needs a recipient and a rule about what is stored, so it is its own block, built when a page needs one (PAGE-BLOCKS.md, open
 * decision 8). It never collects payment details.
 */
export const ClosingBand = defineSection({
  slug: 'sectionClosingBand',
  singular: 'Closing band',
  plural: 'Closing bands',
  group: 'Action',
  fields: sectionFields({ own: [actionsField()] }),
})
