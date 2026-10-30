import type { CollectionBeforeValidateHook } from 'payload'

import { slugify, uniqueSlug } from '@/lib/slug'

/**
 * Fills an empty slug from another field when a document is created, and makes it unique. Add to a
 * collection that uses Payload's slugField, so it can be created without the admin UI.
 */
export const ensureSlug =
  (source: string, slugFieldName = 'slug'): CollectionBeforeValidateHook =>
  async ({ data, operation, req, collection }) => {
    if (operation !== 'create' || !data) return data
    const given = typeof data[slugFieldName] === 'string' ? slugify(data[slugFieldName]) : ''
    const base = given || slugify(String(data[source] ?? ''))
    data[slugFieldName] = await uniqueSlug(base, async (candidate) => {
      const found = await req.payload.count({
        collection: collection.slug as never,
        where: { [slugFieldName]: { equals: candidate } },
        overrideAccess: true,
        req,
      })
      return found.totalDocs > 0
    })
    return data
  }
