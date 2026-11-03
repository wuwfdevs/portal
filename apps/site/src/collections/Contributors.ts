import type { CollectionConfig } from 'payload'
import { slugField } from 'payload'

import { anyone } from '../access/anyone'
import { requirePermission } from '../access/permissions'
import { bodyEditor } from '../fields/bodyEditor'
import { ensureSlug } from '../hooks/ensureSlug'
import { legacyIdentityWriteOnce } from '../hooks/pathHooks'
import { restrictedBlocksGuard } from '../hooks/restrictedBlocksGuard'
import { listHref } from '../lib/lists/route'
import { revalidatePath } from '../lib/revalidate'

/**
 * A byline: reporters, hosts, fellows, student journalists. Public by design. This is deliberately not
 * the staff `users` collection, whose read access is locked to protect staff privacy; a contributor
 * may be someone with no CMS login at all (a guest host, a Voyager student).
 */
export const Contributors: CollectionConfig = {
  slug: 'contributors',
  labels: { singular: 'Contributor', plural: 'Contributors' },
  access: {
    read: anyone,
    create: requirePermission('content.write'),
    update: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
  },
  admin: { group: 'Editorial', useAsTitle: 'name', defaultColumns: ['name', 'title', 'updatedAt'] },
  hooks: { beforeValidate: [ensureSlug('name')], beforeChange: [legacyIdentityWriteOnce, restrictedBlocksGuard(['biography'])],
    // Their page (/people/<slug>) shows the profile, so an edit must reach readers at once, under the old address too.
    afterChange: [
      ({ doc, previousDoc, req: { context } }) => {
        if (context.disableRevalidate) return doc
        for (const slug of new Set([doc?.slug, previousDoc?.slug])) if (typeof slug === 'string' && slug) revalidatePath(listHref('person', slug))
        return doc
      },
    ],
    afterDelete: [
      ({ doc, req: { context } }) => {
        if (!context.disableRevalidate && typeof doc?.slug === 'string' && doc.slug) revalidatePath(listHref('person', doc.slug))
        return doc
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    slugField({ useAsSlug: 'name' }),
    { name: 'title', type: 'text', admin: { description: 'For example "Coastal Futures Fellow".' } },
    { name: 'bio', type: 'textarea', label: 'Short bio', admin: { description: 'One or two sentences, shown under the name on their page and on a byline.' } },
    {
      name: 'biography',
      type: 'richText',
      editor: bodyEditor,
      label: 'Full biography',
      admin: { description: 'The longer version, shown on their page under the short bio. Optional.' },
    },
    {
      name: 'links',
      type: 'array',
      label: 'Links',
      maxRows: 8,
      admin: { description: 'Their own site and social accounts, shown on their page. Only http(s) addresses.' },
      fields: [
        { name: 'label', type: 'text', required: true },
        {
          name: 'url',
          type: 'text',
          required: true,
          validate: (v: unknown) => (typeof v === 'string' && /^https?:\/\/[^\s]+$/i.test(v) ? true : 'Enter a full web address that starts with https:// or http://'),
        },
      ],
    },
    { name: 'photo', type: 'upload', relationTo: 'media' },
    {
      name: 'initials',
      type: 'text',
      maxLength: 3,
      admin: { description: 'Shown when there is no photo. Defaults to the name\'s initials.' },
      hooks: {
        beforeValidate: [
          ({ value, siblingData }) => {
            if (value) return value
            const name = String(siblingData?.name ?? '').trim()
            return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
          },
        ],
      },
    },
    {
      name: 'legacy',
      type: 'group',
      label: 'From Grove',
      admin: { position: 'sidebar', description: 'Set by the migration. Leave empty for new work.' },
      fields: [
        { name: 'legacyPath', type: 'text', unique: true, index: true, admin: { description: 'The Grove path this came from, e.g. /people/rachel-cramer. Set by the migration and then fixed.' } },
        { name: 'groveId', type: 'text', unique: true, index: true, admin: { description: 'Grove\'s contentId for this person. Set by the migration and then fixed; a re-run matches on it.' } },
      ],
    },
  ],
}
