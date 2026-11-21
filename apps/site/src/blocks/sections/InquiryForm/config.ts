import { defineSection, sectionFields } from '../fields'

/**
 * Inquiry form (sponsor pages only): "Request a proposal". A business sends its name, organization, email, interests, budget and a message;
 * the site emails it to corporate support and **stores nothing** (CLAUDE.md → Decisions that are made). The recipient, the choices and the
 * phone and address are the Sponsorship settings (the recipient is staff-only and never reaches the page); the words and labels are this block's.
 * It is its own block because it carries a honeypot and a timing token and writes to no collection. Give the section the anchor `inquire`:
 * every "Request a proposal" button on the sponsor pages links to `/sponsor#inquire`.
 */
export const InquiryForm = defineSection({
  slug: 'sectionInquiryForm',
  singular: 'Inquiry form',
  plural: 'Inquiry forms',
  group: 'Action',
  fields: sectionFields({
    own: [
      { name: 'contactTitle', type: 'text', admin: { description: 'The line above the phone number and address, e.g. "Prefer to talk?".' } },
      { name: 'submitLabel', type: 'text' },
      { name: 'sendingLabel', type: 'text' },
      { name: 'guidelinesNote', type: 'text', admin: { description: 'A line under the button that points to the credit guidelines. Empty: no line.' } },
      { name: 'guidelinesLink', type: 'text', admin: { description: 'The words of that link. It goes to /sponsor/credit-guidelines.' } },
      {
        name: 'labels',
        type: 'group',
        admin: { description: 'The form’s field labels.' },
        fields: [
          { name: 'name', type: 'text' },
          { name: 'organization', type: 'text' },
          { name: 'email', type: 'text' },
          { name: 'phone', type: 'text' },
          { name: 'interests', type: 'text' },
          { name: 'budget', type: 'text' },
          { name: 'message', type: 'text' },
          { name: 'required', type: 'text', admin: { description: 'Read to screen readers after a required field’s name, e.g. "required".' } },
        ],
      },
      { name: 'thanksTitle', type: 'text' },
      { name: 'thanksPrefix', type: 'text', admin: { description: 'Said before what they chose, e.g. "Here’s what you told us you’re interested in:".' } },
    ],
  }),
})
