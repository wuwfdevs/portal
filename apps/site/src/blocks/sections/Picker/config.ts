import { validateHref } from '@/lib/section-links'

import { defineSection, sectionFields } from '../fields'

/**
 * Picker: choose one option, see its panel (PAGE-BLOCKS.md → Block catalogue). Works without script: the options are real radio buttons
 * and the panel follows the one checked.
 *
 * SEAM (open design question, PAGE-BLOCKS.md): how a panel refers to a price in `sponsorship-settings`. That global does not exist until
 * phase 3, so the price is typed text here, as Cards has it. When the question is answered, the reference goes in `price` below (a
 * relationship or a key into the settings, resolved in `Component.tsx` where `priceOf` is), and nothing else in the block changes.
 * Nobody should type a number here that also lives in a settings page.
 */
export const PICKER_MAX_OPTIONS = 8

export const Picker = defineSection({
  slug: 'sectionPicker',
  singular: 'Picker',
  plural: 'Pickers',
  group: 'Facts and steps',
  fields: sectionFields({
    own: [
      {
        name: 'options',
        type: 'array',
        minRows: 2,
        maxRows: PICKER_MAX_OPTIONS,
        admin: { description: 'The first option is shown when the page opens.' },
        fields: [
          { name: 'label', type: 'text', required: true, admin: { description: 'The choice, as a short name: "I\'m new".' } },
          { name: 'hint', type: 'text', admin: { description: 'A few words under the name on the choice.' } },
          { name: 'title', type: 'text', required: true, admin: { description: 'The panel\'s title.' } },
          { name: 'lead', type: 'textarea', admin: { description: 'The panel\'s first sentence or two.' } },
          { name: 'points', type: 'textarea', admin: { description: 'One short line each, as a list in the panel.' } },
          { name: 'price', type: 'text', admin: { description: 'Typed as it should read, e.g. "From $23 a credit". Prices that change live in a settings page, so this will become a reference there.' } },
          { name: 'linkLabel', type: 'text' },
          { name: 'linkHref', type: 'text', label: 'Link', validate: validateHref },
        ],
      },
    ],
  }),
})
