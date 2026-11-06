import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { APIError, slugField } from 'payload'

import { publishedOrContentStaff, requirePermission } from '../access/permissions'
import { enforcePublishPermission } from '../hooks/enforcePublishPermission'
import { ensureSlug } from '../hooks/ensureSlug'
import { revalidatePath, revalidateTag } from '../lib/revalidate'
import { validateSupportHref } from '../lib/support-link'
import { validateRecordingUrl } from '../lib/radiolive/recording'
import { normalizeVtt, validateVtt } from '../lib/video/clips'

const tidyCaptions: CollectionBeforeChangeHook = ({ data }) => {
  if (typeof data?.captionsVtt === 'string' && data.captionsVtt.trim() !== '') data.captionsVtt = normalizeVtt(data.captionsVtt)
  return data
}

/** `/radiolive/artists/...` belongs to the artist pages, so no show may take that word as its address. */
const notArtists: CollectionBeforeValidateHook = ({ data }) => {
  if (data?.slug === 'artists') throw new APIError('"artists" is the artists\' section of the RadioLive page. Give the show another address.', 400, undefined, true)
  return data
}

const refresh = (slug: unknown): void => {
  revalidatePath('/radiolive')
  revalidatePath('/') // the home page's RadioLive panel
  if (typeof slug === 'string' && slug) revalidatePath(`/radiolive/${slug}`)
  revalidateTag('radiolive-sitemap', 'max')
}

/**
 * One RadioLive show: a night at the Museum of Commerce. Before it, it is a listing with a lineup and a way to get tickets (an outside
 * ticketing site; this site sells nothing). After it, the same record gains the recorded set and its captions. Publishing makes it public.
 */
export const Performances: CollectionConfig = {
  slug: 'performances',
  labels: { singular: 'RadioLive show', plural: 'RadioLive shows' },
  access: { read: publishedOrContentStaff, create: requirePermission('content.write'), update: requirePermission('content.write'), delete: requirePermission('content.publish') },
  admin: { group: 'RadioLive', useAsTitle: 'title', defaultColumns: ['title', 'startsAt', '_status'], description: 'A RadioLive night. Add the lineup before it, the recording after.' },
  defaultSort: '-startsAt',
  hooks: {
    beforeValidate: [ensureSlug('title'), notArtists],
    beforeChange: [enforcePublishPermission, tidyCaptions],
    afterChange: [({ doc, previousDoc, req: { context } }) => {
      if (!context.disableRevalidate) for (const slug of new Set([doc?.slug, previousDoc?.slug])) refresh(slug)
      return doc
    }],
    afterDelete: [({ doc, req: { context } }) => {
      if (!context.disableRevalidate) refresh(doc?.slug)
      return doc
    }],
  },
  versions: { drafts: true, maxPerDoc: 25 },
  fields: [
    { name: 'title', type: 'text', required: true, admin: { description: 'Usually the lineup, e.g. "Nicholas Edward Williams, Pat Byrn & Julie Patcouli".' } },
    slugField({ useAsSlug: 'title' }),
    { name: 'startsAt', type: 'date', required: true, index: true, admin: { date: { pickerAppearance: 'dayAndTime' }, description: 'When the show starts, in Central time.' } },
    { name: 'venue', type: 'text', defaultValue: 'Museum of Commerce, 201 Zaragoza St.' },
    { name: 'lineup', type: 'relationship', relationTo: 'artists', hasMany: true, admin: { description: 'The artists, in the order they play.' } },
    { name: 'description', type: 'textarea', admin: { description: 'One or two sentences about the night.' } },
    { name: 'photo', type: 'upload', relationTo: 'media', admin: { description: 'A picture from the night, or of the lineup. Give it alt text in the media library.' } },
    {
      type: 'row',
      fields: [
        {
          name: 'ticketsStatus',
          type: 'select',
          defaultValue: 'soon',
          options: [
            { label: 'Tickets on sale soon', value: 'soon' },
            { label: 'On sale (needs the ticket address)', value: 'onSale' },
            { label: 'Sold out', value: 'soldOut' },
            { label: 'Free to attend', value: 'free' },
          ],
          admin: { width: '40%' },
        },
        { name: 'ticketsUrl', type: 'text', validate: validateSupportHref, admin: { width: '60%', description: 'Where tickets are sold (the ticketing site\'s address, https://). WUWF sells nothing here.' } },
      ],
    },
    { name: 'virtualTicketsUrl', type: 'text', validate: validateSupportHref, admin: { description: 'A ticket page for the virtual (online) show, if there is one. https://. Shown as a second button.' } },
    {
      name: 'recordingUrl',
      type: 'text',
      label: 'Recording on YouTube or Vimeo',
      validate: validateRecordingUrl,
      admin: { description: 'The address of the recorded set on YouTube or Vimeo, once it is edited (one video, not a playlist). Turn captions on in the video there; the site cannot check. If you also upload a file below, the file is shown.' },
    },
    { name: 'video', type: 'upload', relationTo: 'video', admin: { description: 'Or a recording uploaded to the video library. An uploaded recording needs captions to publish.' } },
    {
      name: 'captionsVtt',
      type: 'textarea',
      label: 'Captions (WebVTT)',
      validate: (value: string | null | undefined, { siblingData }: { siblingData?: { video?: unknown } }) => (siblingData?.video ? validateVtt(value) : true),
      admin: { description: 'Required when there is a recording. Paste the WebVTT file.', rows: 8, condition: (data) => Boolean(data?.video) },
    },
  ],
}
