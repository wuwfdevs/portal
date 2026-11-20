import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'
import { slugField } from 'payload'

import { publishedOrContentStaff, requirePermission } from '../access/permissions'
import { enforcePublishPermission } from '../hooks/enforcePublishPermission'
import { ensureSlug } from '../hooks/ensureSlug'
import { listPathsForStory } from '../lib/lists/revalidate'
import { revalidatePath, revalidateTag } from '../lib/revalidate'
import { normalizeVtt, validateVtt } from '../lib/video/clips'

const stampPublished: CollectionBeforeChangeHook = ({ data }) => {
  if (data?._status === 'published' && !data.publishedAt) data.publishedAt = new Date().toISOString()
  if (typeof data?.captionsVtt === 'string' && data.captionsVtt.trim() !== '') data.captionsVtt = normalizeVtt(data.captionsVtt)
  return data
}

/**
 * Short video (boards 7 and 8): a short vertical clip with captions, in a series, pointing at the story or episode it came from.
 * The picture and sound are a file in the video library; the captions are WebVTT text kept here, so a clip cannot be published
 * without them. A clip's funder line comes from its series' agreements, like a show page's.
 */
export const Clips: CollectionConfig = {
  slug: 'clips',
  labels: { singular: 'Short video', plural: 'Short videos' },
  access: {
    read: publishedOrContentStaff,
    create: requirePermission('content.write'),
    update: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
  },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'series', '_status', 'publishedAt'], description: 'Short vertical video. Needs captions to publish.' },
  hooks: {
    beforeValidate: [ensureSlug('title')],
    beforeChange: [enforcePublishPermission, stampPublished],
    afterChange: [
      async ({ doc, previousDoc, req: { context, payload } }) => {
        if (!context.disableRevalidate) {
          revalidatePath('/video')
          revalidatePath('/') // the home page's short-video row
          // The section page of the story it came from (and of the story it came from before): a section page carries its clips.
          for (const story of new Set([doc?.story, previousDoc?.story])) {
            const id = story && typeof story === 'object' ? story.id : story
            if (id == null) continue
            const found = await payload.find({ collection: 'posts', where: { id: { equals: id } }, depth: 0, limit: 1, overrideAccess: true, pagination: false, select: { section: true } }).catch(() => null)
            for (const p of await listPathsForStory(payload, found?.docs[0])) revalidatePath(p)
          }
          for (const slug of new Set([doc?.slug, previousDoc?.slug])) if (typeof slug === 'string' && slug) revalidatePath(`/video/${slug}`)
          revalidateTag('clips-sitemap', 'max')
        }
        return doc
      },
    ],
    afterDelete: [
      ({ doc, req: { context } }) => {
        if (!context.disableRevalidate) {
          revalidatePath('/video')
          revalidatePath('/')
          if (typeof doc?.slug === 'string') revalidatePath(`/video/${doc.slug}`)
          revalidateTag('clips-sitemap', 'max')
        }
        return doc
      },
    ],
  },
  versions: { drafts: true, maxPerDoc: 25 },
  fields: [
    { name: 'title', type: 'text', required: true },
    slugField(),
    { name: 'description', type: 'textarea', admin: { description: 'One or two sentences under the title.' } },
    { name: 'video', type: 'upload', relationTo: 'video', required: true, admin: { description: 'The clip, from the video library. Vertical (9:16) video fits best. Its poster picture is used before it plays.' } },
    {
      name: 'captionsVtt',
      type: 'textarea',
      label: 'Captions (WebVTT)',
      required: true,
      validate: (value: string | null | undefined) => validateVtt(value),
      admin: { description: 'Required. Paste the WebVTT file: it starts with the word WEBVTT, then timed lines. Shown by default.', rows: 10 },
    },
    { name: 'series', type: 'relationship', relationTo: 'series', admin: { position: 'sidebar', description: 'The row it appears in, e.g. "After Isaias". Its funder line, if it has one, shows with the clip.' } },
    { name: 'story', type: 'relationship', relationTo: 'posts', admin: { position: 'sidebar', description: 'The story or episode this clip came from. Gives the clip its "Read the story" button.' } },
    { name: 'ctaLabel', type: 'text', admin: { position: 'sidebar', description: 'The button\'s words. Default: "Read the story". For an episode: "Hear the episode".' } },
    { name: 'contributors', type: 'relationship', relationTo: 'contributors', hasMany: true, admin: { position: 'sidebar', description: 'Who made it. If empty, the video file\'s credit is shown.' } },
    { name: 'publishedAt', type: 'date', admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' }, description: 'Set when published, if empty.' } },
  ],
}
