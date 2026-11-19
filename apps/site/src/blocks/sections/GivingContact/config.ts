import { defineSection, sectionFields } from '../fields'

export const CONTACT_VARIANTS = [
  { label: 'Hero: words beside a card with the call and email buttons', value: 'hero' },
  { label: 'Band: words and the call and email buttons', value: 'band' },
  { label: 'Line: one sentence with the number in it', value: 'line' },
] as const

/**
 * Giving contact (giving pages only): Member Services' phone and email, drawn three ways. **The number and the address are the Giving settings, typed
 * once**; this block holds the words around them. The line variant's sentence says where they go with {phone} and {email}, which become links.
 * A button with no number or address in the settings is not drawn, and a block with nothing to show draws nothing.
 */
export const GivingContact = defineSection({
  slug: 'sectionGivingContact',
  singular: 'Giving contact',
  plural: 'Giving contacts',
  group: 'Action',
  fields: sectionFields({
    heading: false,
    variants: CONTACT_VARIANTS,
    own: [
      { name: 'label', type: 'text', admin: { description: 'Hero only: a short line above the headline.', condition: (_, s) => s?.variant === 'hero' } },
      { name: 'headline', type: 'text', admin: { description: 'Hero and band. The line variant has none.', condition: (_, s) => s?.variant !== 'line' } },
      {
        name: 'line',
        type: 'textarea',
        admin: { description: 'Hero and band: the words under the headline. Line: the sentence, e.g. “Questions about your gift? Call WUWF Member Services at {phone}.”' },
      },
      { name: 'cardTitle', type: 'text', admin: { condition: (_, s) => s?.variant === 'hero' } },
      { name: 'cardText', type: 'textarea', maxLength: 400, admin: { condition: (_, s) => s?.variant === 'hero' } },
      { name: 'cardNote', type: 'textarea', maxLength: 300, admin: { description: 'Printed after the email address.', condition: (_, s) => s?.variant === 'hero' } },
      { name: 'callLabel', type: 'text', admin: { description: 'The call button, e.g. “Call {phone}”. Empty: no button.', condition: (_, s) => s?.variant !== 'line' } },
      { name: 'emailLabel', type: 'text', admin: { description: 'The email button. Empty: no button.', condition: (_, s) => s?.variant !== 'line' } },
    ],
  }),
})
