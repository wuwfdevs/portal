import { actionsField, defineSection, sectionFields } from '../fields'
import { validateHref } from '@/lib/section-links'

const text = (name: string, description?: string) => ({ name, type: 'text' as const, ...(description ? { admin: { description } } : {}) })

/**
 * Thank-you (giving pages only): the page a donor lands on after giving (board 14d). The donation form can send the first name, the amount and how often
 * back in the page's address (`name`, `amount`, `frequency`); each is read strictly and nothing is stored, so with none of it the block still says thank
 * you without claiming to know the gift. **The page that holds this block is a coded route that hands the query to its sections**
 * (`app/(frontend)/support/thanks`); held on any other address it shows the plain words. No ask, no form.
 */
export const ThankYou = defineSection({
  slug: 'sectionThankYou',
  singular: 'Thank-you',
  plural: 'Thank-yous',
  group: 'Lead',
  fields: sectionFields({
    heading: false,
    own: [
      { name: 'label', type: 'text' },
      text('title', 'When the donation form sent no first name.'),
      text('titleNamed', 'With one: “Thank you, {name}. You’re part of WUWF now.”'),
      { name: 'body', type: 'textarea', maxLength: 700, admin: { description: 'When the amount and frequency are not known.' } },
      { name: 'bodyMonthly', type: 'textarea', maxLength: 700, admin: { description: '{amount} becomes the amount: “Your monthly gift of {amount} is how…”' } },
      { name: 'bodyOnce', type: 'textarea', maxLength: 700 },
      actionsField(),
      text('nextTitle'),
      {
        name: 'next',
        type: 'array',
        maxRows: 5,
        admin: { description: 'What happens next, with when it happens first: “This week.” “A note from the station.”' },
        fields: [
          { name: 'lead', type: 'text', required: true, maxLength: 60 },
          { name: 'text', type: 'text', maxLength: 300 },
        ],
      },
      text('promptTitle'),
      text('promptLabel'),
      { name: 'promptHref', type: 'text', label: 'Prompt link', validate: validateHref },
    ],
  }),
})
