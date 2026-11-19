import type { Block, Field } from 'payload'

import { validateHref } from '@/lib/section-links'
import { isValidAnchor } from '@/lib/sections-anchors'

import { SECTION_GROUPS, type SectionGroup } from './types'

/** Where a block's picker thumbnail lives: `public/section-thumbnails/<slug>.svg`, 3:2 (`viewBox="0 0 300 200"`). */
export const thumbnailUrl = (slug: string): string => `/section-thumbnails/${slug}.svg`

/**
 * The fields every section block starts with, in this order, from one builder (PAGE-BLOCKS.md → Anatomy of a section block):
 * `hidden`, `anchor`, `tone`, then `variant` where the block has more than one layout, then the optional `heading`, then the block's own.
 * No free colour, spacing or HTML field: the tone is a name and the theme decides what it looks like.
 */
export function sectionFields(options: {
  variants?: ReadonlyArray<{ label: string; value: string }>
  heading?: boolean
  own: Field[]
}): Field[] {
  const fields: Field[] = [
    {
      name: 'hidden',
      type: 'checkbox',
      label: 'Hide this section',
      defaultValue: false,
      admin: { description: 'Parks the section without deleting it. It does not show on the page.' },
    },
    {
      name: 'anchor',
      type: 'text',
      admin: { description: 'Optional. Lower-case words joined by hyphens, e.g. on-air-rates. A link to the page can end in #on-air-rates to land on this section.' },
      validate: (value: unknown) =>
        value === undefined || value === null || value === '' || isValidAnchor(value) ? true : 'Use lower-case words joined by hyphens, e.g. on-air-rates.',
    },
    {
      name: 'tone',
      type: 'select',
      required: true,
      defaultValue: 'plain',
      options: [
        { label: 'Plain', value: 'plain' },
        { label: 'Grey', value: 'grey' },
        { label: 'Accent', value: 'accent' },
        { label: 'Dark', value: 'dark' },
        { label: 'Teal', value: 'teal' },
        { label: 'Lime', value: 'lime' },
        { label: 'Soft lime', value: 'softlime' },
      ],
      admin: { description: 'The ground of the section. The page theme decides what each looks like.' },
    },
  ]
  if (options.variants && options.variants.length > 1) {
    fields.push({
      name: 'variant',
      type: 'select',
      required: true,
      defaultValue: options.variants[0]!.value,
      options: options.variants.map((v) => ({ label: v.label, value: v.value })),
    })
  }
  if (options.heading !== false) {
    fields.push({
      name: 'heading',
      type: 'group',
      fields: [
        { name: 'eyebrow', type: 'text' },
        { name: 'title', type: 'text' },
        { name: 'intro', type: 'textarea', admin: { description: 'A blank line starts a new paragraph.' } },
      ],
    })
    fields.push({
      name: 'placement',
      type: 'select',
      defaultValue: 'stacked',
      options: [
        { label: 'Above the content', value: 'stacked' },
        { label: 'Beside the content (a column on the left, on a wide screen)', value: 'side' },
      ],
      admin: { description: 'Where the heading sits. A phone always shows it above.' },
    })
  }
  return [...fields, ...options.own]
}

/** A section block definition: the slug, the picker's group and thumbnail, and the fields (use `sectionFields` for them). */
export function defineSection(def: {
  slug: string
  singular: string
  plural?: string
  group: SectionGroup
  fields: Field[]
}): Block {
  if (!def.slug.startsWith('section')) throw new Error(`Section block slugs start with "section": ${def.slug}`)
  if (!(SECTION_GROUPS as readonly string[]).includes(def.group)) throw new Error(`Unknown picker group: ${def.group}`)
  return {
    slug: def.slug,
    interfaceName: def.slug.charAt(0).toUpperCase() + def.slug.slice(1),
    labels: { singular: def.singular, plural: def.plural ?? `${def.singular}s` },
    admin: { group: def.group, images: { thumbnail: { url: thumbnailUrl(def.slug), alt: `${def.singular} section` } } },
    fields: def.fields,
  }
}

/**
 * A short list of buttons: a label and a link each. Used by the blocks that lead or close (Feature, Closing band, Support). A link is
 * validated here and drawn only through `safeHref` (`SectionActions`); a button with no label or no safe address is not drawn.
 */
export function actionsField(options: { name?: string; maxRows?: number; description?: string } = {}): Field {
  return {
    name: options.name ?? 'actions',
    type: 'array',
    maxRows: options.maxRows ?? 2,
    admin: { description: options.description ?? 'Up to two buttons. The first is the main one.' },
    fields: [
      { name: 'label', type: 'text', required: true },
      { name: 'href', type: 'text', label: 'Link', required: true, validate: validateHref },
    ],
  }
}

/**
 * One optional link under a block's content ("See the credit guidelines →"): a label and an address. Used by the blocks that often need a way
 * on to a related page (Cards, Stats, Callout). Drawn by `SectionMore`, through `safeHref`; with no label or no safe address nothing is drawn.
 */
export function moreLinkFields(): Field[] {
  return [
    { name: 'moreLabel', type: 'text', admin: { description: 'Optional: the words of one link under the section, e.g. "See the credit guidelines →".' } },
    { name: 'moreHref', type: 'text', label: 'Link for that', validate: validateHref },
  ]
}
