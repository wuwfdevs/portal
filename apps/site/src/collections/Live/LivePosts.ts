import type { CollectionConfig } from 'payload'
import { slugField } from 'payload'

import { publishedOrContentStaff, requirePermission } from '../../access/permissions'
import { featuredMediaBlocks } from '../../blocks/body'
import { bodyEditor } from '../../fields/bodyEditor'
import { enforcePublishPermission } from '../../hooks/enforcePublishPermission'
import { restrictedBlocksGuard } from '../../hooks/restrictedBlocksGuard'
import { ensureSlug } from '../../hooks/ensureSlug'
import { legacyIdentityWriteOnce } from '../../hooks/pathHooks'
import { revalidateBlog, revalidateBlogDelete, stampEnd } from './hooks'

/**
 * A live blog: one page, at `/live-updates/<slug>`, that gathers timestamped updates on a fast-moving event. The blog itself
 * is a normal publishable record (a draft until a publisher publishes it, and only a publisher can end it); its updates are
 * separate records (see LiveUpdates) so an editor can post one without opening, locking or re-versioning the whole blog.
 */
export const LivePosts: CollectionConfig = {
  slug: 'live-posts',
  labels: { singular: 'Live blog', plural: 'Live blogs' },
  access: {
    read: publishedOrContentStaff,
    create: requirePermission('content.write'),
    update: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
  },
  admin: {
    group: 'Editorial',
    useAsTitle: 'title',
    defaultColumns: ['title', 'coverage', 'updatedAt'],
    description: 'A page that gathers timestamped updates on a fast-moving event. Post the updates under "Live updates".',
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    {
      name: 'coverage',
      type: 'select',
      required: true,
      defaultValue: 'live',
      options: [
        { label: 'Live: still updating', value: 'live' },
        { label: 'Ended', value: 'ended' },
      ],
      admin: { position: 'sidebar', description: 'Live shows a "Live" label and checks for new updates. Ended stops both and keeps the page as a record.' },
    },
    { name: 'endedAt', type: 'date', admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' }, description: 'Set when the blog is ended.', condition: (_, s) => s?.coverage === 'ended' } },
    { name: 'description', type: 'textarea', admin: { description: 'One or two sentences for search results and sharing.' } },
    {
      name: 'featuredMedia',
      type: 'blocks',
      label: 'Lead picture',
      maxRows: 1,
      blocks: featuredMediaBlocks,
      admin: { description: 'The picture, gallery or video that opens the page. Optional.' },
    },
    { name: 'intro', type: 'richText', editor: bodyEditor, admin: { description: 'What this is and why it matters, shown above the updates. Optional.' } },
    {
      name: 'pinned',
      type: 'relationship',
      relationTo: 'live-updates',
      hasMany: true,
      maxRows: 3,
      admin: { description: 'Up to three updates to keep at the top, above the newest. Choose from this blog\'s updates.' },
    },
    {
      name: 'legacy',
      type: 'group',
      label: 'From Grove',
      admin: { position: 'sidebar', description: 'Set by the migration. Leave empty for new work.' },
      fields: [
        { name: 'legacyPath', type: 'text', unique: true, index: true, admin: { description: 'The Grove path this came from. Set by the migration and then fixed.' } },
        { name: 'groveId', type: 'text', unique: true, index: true, admin: { description: 'Grove\'s contentId for this page. Set by the migration and then fixed; a re-run matches on it.' } },
        { name: 'modifiedAt', type: 'date', admin: { description: 'When Grove last modified this page.' } },
        { name: 'startedAt', type: 'date', admin: { description: 'When the blog was started (Grove\'s published date). New blogs use the publish date.' } },
      ],
    },
  ],
  hooks: {
    beforeValidate: [ensureSlug('title')],
    beforeChange: [enforcePublishPermission, restrictedBlocksGuard(['intro']), legacyIdentityWriteOnce, stampEnd],
    afterChange: [revalidateBlog],
    afterDelete: [revalidateBlogDelete],
  },
  versions: { drafts: { autosave: false }, maxPerDoc: 25 },
}
