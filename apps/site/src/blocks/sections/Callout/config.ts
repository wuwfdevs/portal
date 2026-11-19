import { defineSection, moreLinkFields, sectionFields } from '../fields'

export const CALLOUT_VARIANTS = [
  { label: 'Tint: a note in a tinted box', value: 'tint' },
  { label: 'Quote: a sentence set apart', value: 'quote' },
  { label: 'Lime note: a note in a pale lime box', value: 'lime' },
] as const

/** Callout: one thing to set apart (PAGE-BLOCKS.md → Block catalogue). Plain text. A review bracket on a board never prints. */
export const Callout = defineSection({
  slug: 'sectionCallout',
  singular: 'Callout',
  plural: 'Callouts',
  group: 'Text',
  fields: sectionFields({
    heading: false,
    variants: CALLOUT_VARIANTS,
    own: [
      { name: 'title', type: 'text' },
      { name: 'text', type: 'textarea', required: true, admin: { description: 'A blank line starts a new paragraph.' } },
      { name: 'cite', type: 'text', admin: { description: 'Quote only: who said it, or where it comes from.', condition: (_, s) => s?.variant === 'quote' } },
      ...moreLinkFields(),
    ],
  }),
})
