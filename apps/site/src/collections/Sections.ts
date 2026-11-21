import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { APIError, slugField } from 'payload'

import { anyone } from '../access/anyone'
import { requirePermission } from '../access/permissions'
import { ensureSlug } from '../hooks/ensureSlug'
import { PAGE_SET_FIRST_SEGMENTS, RESERVED_FIRST_SEGMENTS, SECTION_SLUG } from '../lib/paths'
import { DEFAULT_SWATCH, SWATCH_IDS, SWATCH_LABELS } from '../lib/swatches'

/** A section's slug becomes the first part of every new story's address, so it has to be a safe path segment. */
const checkSectionSlug: CollectionBeforeChangeHook = ({ data }) => {
  const slug = data?.slug
  if (typeof slug !== 'string') return data
  if (!SECTION_SLUG.test(slug)) {
    throw new APIError('A section\'s address name uses lowercase letters, numbers and single hyphens only.', 400, undefined, true)
  }
  if (RESERVED_FIRST_SEGMENTS.has(slug) || PAGE_SET_FIRST_SEGMENTS.has(slug)) {
    throw new APIError(`"${slug}" belongs to the site itself and cannot be a section.`, 400, undefined, true)
  }
  return data
}

/**
 * A section (Local News, Commentary, Florida News...) as Grove has them. It is the first part of a story's address
 * (`/{section}/{YYYY-MM-DD}/{slug}`) and nothing more: it is not an origin (`florida-news` was a statewide partner)
 * and not a topic (topics are reader navigation, `categories`). Renaming a section never moves an existing story,
 * because a story's path is stored once at its first publish.
 *
 * Its `swatch` is how its name is coloured where the site draws it as a chip, an eyebrow or a heading highlight (the site's design
 * direction, 2026-11). It is looks only: a choice from a fixed palette (`lib/swatches.ts`), never a typed colour, so every choice is readable.
 */
export const Sections: CollectionConfig = {
  slug: 'sections',
  labels: { singular: 'Section', plural: 'Sections' },
  access: {
    read: anyone,
    // Sections decide what addresses new stories get, so they are changed by publishers, not editors.
    create: requirePermission('content.publish'),
    update: requirePermission('content.publish'),
    delete: requirePermission('content.publish'),
  },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug'] },
  hooks: { beforeValidate: [ensureSlug('title')], beforeChange: [checkSectionSlug] },
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField({ position: undefined }),
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'For the section page, when there is one.' },
    },
    {
      name: 'swatch',
      label: 'Colour',
      type: 'select',
      defaultValue: DEFAULT_SWATCH,
      options: SWATCH_IDS.map((id) => ({ label: SWATCH_LABELS[id], value: id })),
      admin: { description: "The colour family of this section's name where the site draws it as a chip, a small label or a heading highlight. Looks only: it changes no address and no story." },
    },
  ],
}
