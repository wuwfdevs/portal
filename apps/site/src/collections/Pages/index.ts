import { ensureSlug } from '../../hooks/ensureSlug'
import { legacyIdentityWriteOnce, pathBeforeChange, redirectOnPathChange } from '../../hooks/pathHooks'
import { pathField } from '../../fields/path'
import { bodyEditor } from '../../fields/bodyEditor'
import type { CollectionConfig } from 'payload'
import type { Config } from '../../payload-types'

import { requirePermission } from '../../access/permissions'
import { pagesCreate, pagesRead, pagesUpdate } from '../../access/pages'
import { enforcePageSet } from '../../hooks/enforcePageSet'
import { blocksOfferedFor } from '../../blocks/sections/registry'
import { sectionBlockDefinitions } from '../../blocks/sections/registry'
import { PAGE_SETS, PAGE_SET_IDS } from '../../lib/page-sets/registry'
import { PAGE_THEMES } from '../../lib/page-themes/themes'
import { duplicateAnchors } from '../../lib/sections-anchors'
import { restrictedBlocksGuard } from '../../hooks/restrictedBlocksGuard'
import { Archive } from '../../blocks/ArchiveBlock/config'
import { CallToAction } from '../../blocks/CallToAction/config'
import { Content } from '../../blocks/Content/config'
import { FormBlock } from '../../blocks/Form/config'
import { MediaBlock } from '../../blocks/MediaBlock/config'
import { hero } from '@/heros/config'
import { slugField, validations } from 'payload'

import { demoteOtherHomePages, guardHomePage, isHomeField } from '@/hooks/homePage'
import { demoteOtherShowHomePages, guardShowHome, isShowHomeField, navHiddenField, showField } from '@/hooks/showHomePage'
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
    // Who edits a page depends on its page set (access/pages.ts, lib/page-sets/registry.ts); enforcePageSet checks the set itself.
    create: pagesCreate,
    delete: requirePermission('content.publish'),
    read: pagesRead,
    update: pagesUpdate,
  },
  // This config controls what's populated by default when a page is referenced
  // https://payloadcms.com/docs/queries/select#defaultpopulate-collection-config-property
  // Type safe if the collection slug generic is passed to `CollectionConfig` - `CollectionConfig<'pages'>
  defaultPopulate: {
    title: true,
    slug: true,
    path: true,
    isHome: true,
    show: true,
    isShowHome: true,
  },
  admin: {
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
        { label: 'Sections: an ordered list of section blocks', value: 'sections' },
      ],
      admin: { position: 'sidebar', description: 'The structure of the page. A developer adds templates; staff fill them in.' },
    },
    {
      name: 'pageSet',
      type: 'select',
      options: PAGE_SET_IDS.map((id) => ({ label: PAGE_SETS[id].name, value: id })),
      admin: {
        position: 'sidebar',
        condition: (_, { template }) => template === 'sections',
        description: 'The group this page belongs to: it sets who may edit the page, its look, its sub-navigation and which section types can be added. Leave empty for a stand-alone page.',
      },
    },
    {
      name: 'theme',
      type: 'select',
      options: Object.values(PAGE_THEMES).filter((t) => t.built).map((t) => ({ label: t.label, value: t.id })),
      admin: { position: 'sidebar', condition: (_, { template }) => template === 'sections', description: 'Empty: the page set\'s theme.' },
    },
    showField,
    isShowHomeField,
    {
      type: 'row',
      admin: { condition: (_, { template }) => template === 'sections' },
      fields: [
        { name: 'navLabel', type: 'text', admin: { width: '60%', description: 'The page\'s name in its set\'s sub-navigation. Empty: the title.' } },
        { name: 'navOrder', type: 'number', admin: { width: '40%', description: 'Lowest first. Empty: after the numbered pages.' } },
      ],
    },
    navHiddenField,
    {
      type: 'row',
      admin: { condition: (_, { template }) => template === 'sections' },
      fields: [
        { name: 'noindex', type: 'checkbox', defaultValue: false, admin: { width: '50%', description: 'Ask search engines not to list this page.' } },
        { name: 'noReferrer', type: 'checkbox', defaultValue: false, admin: { width: '50%', description: 'Do not tell the sites it links to where the visitor came from.' } },
      ],
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Sections',
          admin: { condition: (_, { template }) => template === 'sections' },
          fields: [
            {
              name: 'sections',
              type: 'blocks',
              // Defined once in the config's root `blocks`; the picker offers the library plus the page set's own blocks.
              blocks: [],
              blockReferences: sectionBlockDefinitions.map((b) => b.slug) as Array<keyof Config['blocks']>,
              filterOptions: ({ siblingData }) => blocksOfferedFor((siblingData as { pageSet?: string } | undefined)?.pageSet),
              admin: { initCollapsed: true },
              // Payload's own check (including filterOptions) first, then one anchor may name only one section of the page.
              validate: async (value, options) => {
                const base = await validations.blocks(value, options as never)
                if (base !== true) return base
                const dupes = duplicateAnchors(value as Array<{ anchor?: unknown }> | null | undefined)
                return dupes.length > 0 ? `Two sections use the anchor ${dupes.map((d) => `"${d}"`).join(', ')}. Each anchor can name one section.` : true
              },
            },
          ],
        },
        {
          label: 'Page',
          admin: { condition: (_, { template }) => template !== 'blocks' && template !== 'sections' },
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
    isHomeField,
  ],
  hooks: {
    beforeValidate: [ensureSlug('title')],
    afterChange: [demoteOtherHomePages, demoteOtherShowHomePages, redirectOnPathChange, revalidatePage],
    beforeChange: [enforcePageSet, guardHomePage, guardShowHome, restrictedBlocksGuard(['body', 'sections']), pathBeforeChange('pages'), legacyIdentityWriteOnce, populatePublishedAt],
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
