import type { ArrayField, Field, GroupField, NumberField, TextareaField, TextField } from 'payload'

import { validateSupportHref } from '@/lib/support-link'

// Small builders so a global with many fields stays readable. Every public sentence on /sponsor and /support is one of these.

export const text = (name: string, o: Partial<TextField> = {}): TextField => ({ name, type: 'text', maxLength: 200, ...o }) as TextField
export const area = (name: string, o: Partial<TextareaField> = {}): TextareaField => ({ name, type: 'textarea', maxLength: 1500, ...o }) as TextareaField
export const num = (name: string, o: Partial<NumberField> = {}): NumberField => ({ name, type: 'number', min: 0, ...o }) as NumberField
/** A link address field. `example` is the sample path its hint shows an editor, so each global's hint names its own pages. */
export const href = (name: string, label?: string, example = '/sponsor/on-air'): TextField => ({
  name,
  type: 'text',
  label,
  validate: validateSupportHref,
  admin: { description: `A page on this site (${example}), a secure https:// address, or mailto:. Leave empty for no link.` },
})

export const group = (name: string, fields: Field[], description?: string): GroupField => ({ name, type: 'group', admin: { description }, fields })

export const list = (name: string, fields: Field[], o: { max?: number; singular?: string; plural?: string; description?: string } = {}): ArrayField => ({
  name,
  type: 'array',
  maxRows: o.max ?? 24,
  labels: o.singular ? { singular: o.singular, plural: o.plural ?? `${o.singular}s` } : undefined,
  admin: { description: o.description, initCollapsed: true },
  fields,
})

/** A section: an on/off switch, then its words. Switched off, the section is not on the page. */
export const section = (name: string, fields: Field[], o: { switchable?: boolean; description?: string } = {}): GroupField =>
  group(name, [...(o.switchable === false ? [] : [{ name: 'show', type: 'checkbox', label: 'Show this section', defaultValue: true } as Field]), ...fields], o.description)

/** The usual heading block of a section. */
export const heading = (): Field[] => [text('eyebrow'), text('title'), area('body', { admin: { description: 'Blank line between paragraphs.' } })]

/** The page's opening band. `body` is paragraphs; an optional link follows them. */
export const hero = (extra: Field[] = []): GroupField =>
  group('hero', [text('eyebrow'), text('title'), area('body', { admin: { description: 'Blank line between paragraphs.' } }), text('linkLabel'), href('linkHref', 'Link address'), ...extra])

/** A figure with what it counts, and an optional comparison line. Always keep the figure's source in the section's source line. */
export const stats = (name: string, o: { compare?: boolean; max?: number } = {}): ArrayField =>
  list(name, [text('value', { required: true, maxLength: 30 }), text('text', { required: true, maxLength: 300 }), ...(o.compare ? [text('compare', { maxLength: 300 })] : [])], {
    singular: 'Figure',
    plural: 'Figures',
    max: o.max ?? 16,
  })

/** The teal "Get a proposal" band that closes a page. */
export const closing = (): GroupField => group('closing', [text('title'), text('text'), text('label')])

export const source = (name = 'source'): TextareaField => area(name, { maxLength: 2500, admin: { description: 'Where the figures come from and what they are a share of. Every figure needs one.' } })
