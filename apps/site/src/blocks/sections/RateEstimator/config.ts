import { defineSection, sectionFields } from '../fields'

/**
 * Rate estimator (sponsor pages only): the on-air rate card as a table whose rows can be picked, and the schedule estimate under it
 * (PAGE-BLOCKS.md → Block catalogue, set-only blocks). Its own block because the table and the estimate share the picked row, and because
 * the numbers are not typed here: the rate card, the schedule sizes and the discounts are the Sponsorship settings. The words are this block's.
 */
export const RateEstimator = defineSection({
  slug: 'sectionRateEstimator',
  singular: 'Rate estimator',
  plural: 'Rate estimators',
  group: 'Facts and steps',
  fields: sectionFields({
    own: [
      { name: 'note', type: 'textarea', admin: { description: 'Printed under the rate card.' } },
      { name: 'estimatorEyebrow', type: 'text' },
      { name: 'estimatorTitle', type: 'text' },
      { name: 'commitmentLabel', type: 'text', admin: { description: 'The label of the length-of-commitment choices, e.g. "Length of commitment".' } },
      { name: 'creditsLabel', type: 'text', admin: { description: 'The label of the schedule-size choices, e.g. "Credits in the schedule".' } },
      { name: 'estimatorDisclaimer', type: 'text', admin: { description: 'e.g. "An estimate. WUWF confirms every schedule."' } },
      { name: 'estimatorCta', type: 'text', admin: { description: 'The button under the estimate. It goes to the proposal form.' } },
    ],
  }),
})
