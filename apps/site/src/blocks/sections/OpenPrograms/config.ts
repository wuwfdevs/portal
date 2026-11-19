import { defineSection, sectionFields } from '../fields'

/**
 * Open programs (sponsor pages only): the events and programs a business can back, one card each, from the Sponsorship settings. Only
 * programs set to "open" are drawn, and a level without a confirmed price says "Priced on request". The words are this block's; the heading
 * has three forms because it counts what is open.
 */
export const OpenPrograms = defineSection({
  slug: 'sectionOpenPrograms',
  singular: 'Open programs',
  plural: 'Open programs',
  group: 'Collections',
  fields: sectionFields({
    own: [
      { name: 'titleOne', type: 'text', admin: { description: 'The heading when one program is open. Empty: the heading above is used.' } },
      { name: 'titleTwo', type: 'text', admin: { description: 'The heading when two are open. Empty: the heading above is used.' } },
      { name: 'emptyText', type: 'textarea', admin: { description: 'Shown when no program is open.' } },
      { name: 'talkLabel', type: 'text', admin: { description: 'Button text; {name} becomes the program’s name. The button goes to the proposal form.' } },
      { name: 'moreLabel', type: 'text', admin: { description: 'Link text; {name} becomes the program’s name. Drawn only when the program has a page.' } },
      { name: 'levelsLabel', type: 'text' },
      { name: 'recognitionLabel', type: 'text' },
    ],
  }),
})
