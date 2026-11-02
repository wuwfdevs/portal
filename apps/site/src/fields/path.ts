import type { Field } from 'payload'

/**
 * The address a page or story is served at: one value, unique across stories and pages, stored once and resolved by
 * the catch-all route. Migrated records carry Grove's exact path; new stories get theirs at first publish (see
 * `hooks/pathHooks.ts`). Only a publisher can set or change it, and changing a live one writes a redirect.
 */
export const pathField: Field = {
  name: 'path',
  type: 'text',
  unique: true,
  index: true,
  admin: {
    position: 'sidebar',
    description:
      'The address this is served at, e.g. /local-news/2026-10-16/a-story. Made for you at first publish and then fixed. Only a publisher can change it; changing a live address adds a redirect from the old one.',
  },
}
