import { ensureSlug } from '../../hooks/ensureSlug'
import { legacyIdentityWriteOnce, pathBeforeChange, redirectOnPathChange } from '../../hooks/pathHooks'
import { pathField } from '../../fields/path'
import { bodyEditor } from '../../fields/bodyEditor'
import type { CollectionConfig } from 'payload'

import { publishedOrContentStaff, requirePermission } from '../../access/permissions'
import { enforcePublishPermission } from '../../hooks/enforcePublishPermission'
import { restrictedBlocksGuard } from '../../hooks/restrictedBlocksGuard'
import { Archive } from '../../blocks/ArchiveBlock/config'
import { CallToAction } from '../../blocks/CallToAction/config'
import { Content } from '../../blocks/Content/config'
import { FormBlock } from '../../blocks/Form/config'
import { MediaBlock } from '../../blocks/MediaBlock/config'
import { hero } from '@/heros/config'
import { slugField } from 'payload'
import { populatePublishedAt } from '../../hooks/populatePublishedAt'
import { generatePreviewPath } from '../../utilities/generatePreviewPath'
import { revalidateDelete, revalidatePage } from './hooks/revalidatePage'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

export const Pages: CollectionConfig<'pages'> = {
  slug: 'pages',
  access: {
    create: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
    read: publishedOrContentStaff,
    update: requirePermission('content.write'),
  },
  // This config controls what's populated by default when a page is referenced
  // https://payloadcms.com/docs/queries/select#defaultpopulate-collection-config-property
  // Type safe if the collection slug generic is passed to `CollectionConfig` - `CollectionConfig<'pages'>
  defaultPopulate: {
    title: true,
    slug: true,
    path: true,
  },
  admin: {
    group: 'Content',
    defaultColumns: ['title', 'path', 'updatedAt'],
    livePreview: {
      url: ({ data, req }) => generatePreviewPath({ collection: 'pages', data, req }),
    },
    preview: (data, { req }) => generatePreviewPath({ collection: 'pages', data, req }),
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'template',
      type: 'select',
      required: true,
      defaultValue: 'standard',
      options: [
        { label: 'Standard page: a title, a short lead and a body', value: 'standard' },
        { label: 'Blocks (the starter\'s layout; existing pages only)', value: 'blocks' },
      ],
      admin: { position: 'sidebar', description: 'The structure of the page. A developer adds templates; staff fill them in.' },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Page',
          admin: { condition: (_, { template }) => template !== 'blocks' },
          fields: [
            { name: 'summary', type: 'textarea', admin: { description: 'A short lead shown under the title. Optional.' } },
            { name: 'body', type: 'richText', editor: bodyEditor, label: 'Body', admin: { description: 'Text, pictures, audio, video and embeds, the same blocks as a story.' } },
          ],
        },
        {
          fields: [hero],
          label: 'Hero',
          admin: { condition: (_, { template }) => template === 'blocks' },
        },
        {
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blocks: [CallToAction, Content, MediaBlock, Archive, FormBlock],
              admin: {
                initCollapsed: true,
              },
            },
          ],
          label: 'Content',
          admin: { condition: (_, { template }) => template === 'blocks' },
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
        position: 'sidebar',
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
          admin: { description: 'The Grove path this came from, e.g. /local-news/2026-10-16/a-story. Set by the migration and then fixed; the live address is the address field.' },
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
    pathField,
    slugField(),
  ],
  hooks: {
    beforeValidate: [ensureSlug('title')],
    afterChange: [redirectOnPathChange, revalidatePage],
    beforeChange: [enforcePublishPermission, restrictedBlocksGuard(['body']), pathBeforeChange('pages'), legacyIdentityWriteOnce, populatePublishedAt],
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
