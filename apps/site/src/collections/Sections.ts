import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { APIError, slugField } from 'payload'

import { anyone } from '../access/anyone'
import { requirePermission } from '../access/permissions'
import { ensureSlug } from '../hooks/ensureSlug'
import { RESERVED_FIRST_SEGMENTS, SECTION_SLUG } from '../lib/paths'

/** A section's slug becomes the first part of every new story's address, so it has to be a safe path segment. */
const checkSectionSlug: CollectionBeforeChangeHook = ({ data }) => {
  const slug = data?.slug
  if (typeof slug !== 'string') return data
  if (!SECTION_SLUG.test(slug)) {
    throw new APIError('A section\'s address name uses lowercase letters, numbers and single hyphens only.', 400, undefined, true)
  }
  if (RESERVED_FIRST_SEGMENTS.has(slug)) {
    throw new APIError(`"${slug}" belongs to the site itself and cannot be a section.`, 400, undefined, true)
  }
  return data
}

/**
 * A section (Local News, Commentary, Florida News...) as Grove has them. It is the first part of a story's address
 * (`/{section}/{YYYY-MM-DD}/{slug}`) and nothing more: it is not an origin (`florida-news` was a statewide partner)
 * and not a topic (topics are reader navigation, `categories`). Renaming a section never moves an existing story,
 * because a story's path is stored once at its first publish.
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
  admin: { group: 'Editorial', useAsTitle: 'title', defaultColumns: ['title', 'slug'] },
  hooks: { beforeValidate: [ensureSlug('title')], beforeChange: [checkSectionSlug] },
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField({ position: undefined }),
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'For the section page, when there is one.' },
    },
  ],
}
