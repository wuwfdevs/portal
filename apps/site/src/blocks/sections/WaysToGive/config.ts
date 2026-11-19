import { defineSection, sectionFields } from '../fields'
import { validateHref } from '@/lib/section-links'

const WAY_KEYS = [
  { label: 'Vehicle or boat', value: 'vehicles' },
  { label: 'Stock, IRA or fund', value: 'assets' },
  { label: 'Through work', value: 'work' },
  { label: 'In someone’s name', value: 'gift' },
  { label: 'In your will', value: 'will' },
]

/**
 * Ways to give (giving pages only): the Other ways to give page's opening, the choices across the top and the one that is open (board 14b). Each choice is a
 * plain link (`?way=stock`), so one can be shared and the page works without script: **the page that holds this block is a coded route that hands the
 * query to its sections** (`app/(frontend)/support/ways`), because the open choice is decided on the server and a cached page must not read the request.
 * Held on any other address the first choice shows. The details a donor gives a broker or fund are in the Giving settings, typed once.
 */
export const WaysToGive = defineSection({
  slug: 'sectionWaysToGive',
  singular: 'Ways to give',
  plural: 'Ways to give',
  group: 'Action',
  fields: sectionFields({
    heading: false,
    own: [
      { name: 'label', type: 'text' },
      { name: 'headline', type: 'text', required: true },
      { name: 'line', type: 'textarea', admin: { description: 'A blank line starts a new paragraph.' } },
      {
        name: 'groups',
        type: 'array',
        maxRows: 5,
        admin: { description: 'The choices across the top of the page, in this order.' },
        fields: [
          { name: 'key', type: 'select', required: true, options: WAY_KEYS },
          { name: 'label', type: 'text', required: true },
          { name: 'best', type: 'text', admin: { description: 'Who it suits: “You have one to part with.”' } },
          { name: 'effort', type: 'text', admin: { description: 'How much it takes: “One phone call”.' } },
        ],
      },
      {
        name: 'panels',
        type: 'array',
        maxRows: 12,
        admin: { description: 'What opens under a choice. A choice with several panels (Stock, IRA gift, Donor-advised fund) shows a second row.' },
        fields: [
          { name: 'group', type: 'select', required: true, options: WAY_KEYS },
          { name: 'slug', type: 'text', required: true, maxLength: 40, admin: { description: 'The word in the address (?way=stock): lowercase letters, no spaces.' } },
          { name: 'tabLabel', type: 'text', admin: { description: 'When a choice has several panels, the name on its second row.' } },
          { name: 'eyebrow', type: 'text' },
          { name: 'title', type: 'text' },
          { name: 'lead', type: 'textarea', maxLength: 600 },
          { name: 'buttonLabel', type: 'text' },
          { name: 'buttonHref', type: 'text', label: 'Button link', validate: validateHref },
          { name: 'secondaryLabel', type: 'text', admin: { description: 'An optional second button, e.g. real estate beside vehicles.' } },
          { name: 'secondaryHref', type: 'text', label: 'Second button link', validate: validateHref },
          { name: 'showDetails', type: 'checkbox', label: 'Show the details to give a broker or fund', defaultValue: false },
          { name: 'steps', type: 'textarea', admin: { description: 'How it works, in order: one step to a line.' } },
          { name: 'notes', type: 'textarea', admin: { description: 'Good to know: one note to a line.' } },
        ],
      },
      { name: 'stepsTitle', type: 'text' },
      { name: 'notesTitle', type: 'text' },
      { name: 'detailsTitle', type: 'text', admin: { description: 'Over the details a broker or fund needs (their rows are in Giving settings).' } },
      { name: 'copyLabel', type: 'text' },
      { name: 'copiedLabel', type: 'text' },
      { name: 'detailsNote', type: 'textarea', maxLength: 400 },
    ],
  }),
})
