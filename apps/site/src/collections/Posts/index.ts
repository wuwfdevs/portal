import type { CollectionConfig } from 'payload'

import { publishedOrContentStaff, requirePermission } from '../../access/permissions'
import { featuredMediaBlocks } from '../../blocks/body'
import { bodyEditor } from '../../fields/bodyEditor'
import { enforcePublishPermission } from '../../hooks/enforcePublishPermission'
import { ensureSlug } from '../../hooks/ensureSlug'
import { legacyIdentityWriteOnce, pathBeforeChange, redirectOnPathChange } from '../../hooks/pathHooks'
import { pathField } from '../../fields/path'
import { restrictedBlocksGuard } from '../../hooks/restrictedBlocksGuard'
import { generatePreviewPath } from '../../utilities/generatePreviewPath'
import { revalidateDelete, revalidatePost } from './hooks/revalidatePost'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'
import { slugField } from 'payload'
import { PERIOD_OPTIONS } from '../../lib/unearthing/periods'

export const Posts: CollectionConfig<'posts'> = {
  slug: 'posts',
  access: {
    create: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
    read: publishedOrContentStaff,
    update: requirePermission('content.write'),
  },
  // This config controls what's populated by default when a post is referenced
  // https://payloadcms.com/docs/queries/select#defaultpopulate-collection-config-property
  // Type safe if the collection slug generic is passed to `CollectionConfig` - `CollectionConfig<'posts'>
  defaultPopulate: {
    title: true,
    slug: true,
    path: true,
    categories: true,
    meta: {
      image: true,
      description: true,
    },
  },
  admin: {
    defaultColumns: ['title', 'path', 'updatedAt'],
    livePreview: {
      url: ({ data, req }) => generatePreviewPath({ collection: 'posts', data, req }),
    },
    preview: (data, { req }) => generatePreviewPath({ collection: 'posts', data, req }),
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          fields: [
            {
              name: 'featuredMedia',
              type: 'blocks',
              label: 'Featured media',
              maxRows: 1,
              blocks: featuredMediaBlocks,
              admin: { description: 'The picture, gallery or video that opens the story. Add one.' },
            },
            {
              name: 'featuredAudio',
              type: 'upload',
              relationTo: 'audio',
              label: 'Featured audio',
              admin: { description: 'The audio version of this story, for the main player. Optional.' },
            },
            {
              name: 'content',
              type: 'richText',
              editor: bodyEditor,
              label: false,
              required: true,
            },
          ],
          label: 'Content',
        },
        {
          fields: [
            {
              name: 'relatedPosts',
              type: 'relationship',
              admin: {
                position: 'sidebar',
              },
              filterOptions: ({ id }) => {
                return {
                  id: {
                    not_in: [id],
                  },
                }
              },
              hasMany: true,
              relationTo: 'posts',
            },
            {
              name: 'categories',
              type: 'relationship',
              admin: {
                position: 'sidebar',
              },
              hasMany: true,
              relationTo: 'categories',
            },
          ],
          label: 'Meta',
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: 'media',
            }),

            MetaDescriptionField({}),
            PreviewField({
              // if the `generateUrl` function is configured
              hasGenerateFn: true,

              // field paths to match the target field for data
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
        position: 'sidebar',
      },
      hooks: {
        beforeChange: [
          ({ siblingData, value }) => {
            if (siblingData._status === 'published' && !value) {
              return new Date()
            }
            return value
          },
        ],
      },
    },
    {
      name: 'section',
      type: 'relationship',
      relationTo: 'sections',
      admin: {
        position: 'sidebar',
        description: 'Local News, Commentary... The first part of the story\'s address, made at first publish and then fixed.',
      },
    },
    pathField,
    {
      name: 'source',
      type: 'select',
      required: true,
      defaultValue: 'wuwf',
      options: [
        { label: 'WUWF', value: 'wuwf' },
        { label: 'NPR (not ours to alter)', value: 'npr' },
        { label: 'Wire or partner', value: 'wire' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'NPR and wire stories are not WUWF\'s to archive separately or alter beyond headline, teaser and description. They are re-pulled from NPR, not migrated as our own.',
      },
    },
    {
      name: 'legacy',
      type: 'group',
      label: 'From Grove',
      admin: { position: 'sidebar', description: 'Set by the migration. Leave empty for new work.' },
      fields: [
        {
          name: 'legacyPath',
          type: 'text',
          unique: true,
          index: true,
          admin: { description: 'The Grove path this came from, e.g. /local-news/2026-10-16/a-story. Set by the migration and then fixed; the live address is the address field above.' },
        },
        {
          name: 'groveId',
          type: 'text',
          unique: true,
          index: true,
          admin: { description: 'Grove\'s contentId for this page (a UUID). Set by the migration and then fixed; a re-run matches on it, so it cannot duplicate.' },
        },
        {
          name: 'modifiedAt',
          type: 'date',
          admin: { description: 'When Grove last modified this page (its dateModifiedISO). Kept apart from the date this record was last saved here.' },
        },
        {
          name: 'nprId',
          type: 'text',
          unique: true,
          index: true,
          admin: { description: 'NPR\'s identifier for this item, when it has one.' },
        },
      ],
    },
    {
      name: 'contributors',
      type: 'relationship',
      admin: { position: 'sidebar', description: 'The byline.' },
      hasMany: true,
      relationTo: 'contributors',
    },
    {
      name: 'format',
      type: 'select',
      required: true,
      defaultValue: 'web',
      options: [
        { label: 'Story', value: 'web' },
        { label: 'Audio story', value: 'audio' },
        { label: 'Video story', value: 'video' },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'dek',
      type: 'textarea',
      admin: { description: 'The sentence or two under the headline.', position: 'sidebar' },
    },
    {
      name: 'publishingIdentity',
      type: 'relationship',
      relationTo: 'publishing-identities',
      admin: { position: 'sidebar', description: 'The brand this appears under (WUWF News, The Voyager…).' },
    },
    {
      name: 'fellowship',
      type: 'relationship',
      relationTo: 'fellowships',
      admin: { position: 'sidebar', description: 'Attach, don\'t paste: funder acknowledgments follow from this.' },
    },
    { name: 'series', type: 'relationship', relationTo: 'series', admin: { position: 'sidebar' } },
    { name: 'production', type: 'relationship', relationTo: 'productions', admin: { position: 'sidebar' } },
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      admin: { position: 'sidebar', description: 'Unearthing Florida: the place this episode is about. Shown on the hub\'s map.' },
    },
    {
      name: 'period',
      type: 'select',
      options: PERIOD_OPTIONS,
      admin: { position: 'sidebar', description: 'Unearthing Florida: where this episode falls on the timeline.' },
    },
    slugField(),
  ],
  hooks: {
    beforeValidate: [ensureSlug('title')],
    beforeChange: [
      enforcePublishPermission,
      pathBeforeChange('posts'),
      legacyIdentityWriteOnce,
      restrictedBlocksGuard(['content']),
    ],
    afterChange: [redirectOnPathChange, revalidatePost],
    afterDelete: [revalidateDelete],
  },
  versions: {
    drafts: {
      autosave: {
        interval: 100, // We set this interval for optimal live preview
      },
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
}
