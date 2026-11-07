import { ValidationError, type CollectionBeforeChangeHook, type CollectionConfig } from 'payload'

import { publishedOrContentStaff, requirePermission } from '../access/permissions'
import { revalidateShowOf } from '../hooks/seasonRules'

const idOf = (v: unknown): string | number | null =>
  v && typeof v === 'object' && 'id' in v ? (v as { id: string | number }).id : typeof v === 'string' || typeof v === 'number' ? v : null

/** A season number is used once per show. */
const uniqueNumberPerShow: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const show = idOf(data.production ?? originalDoc?.production)
  const number = data.number ?? originalDoc?.number
  if (show === null || typeof number !== 'number') return data
  const clash = await req.payload.find({
    collection: 'seasons',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    where: { and: [{ production: { equals: show } }, { number: { equals: number } }, ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : [])] },
  })
  if (clash.docs[0]) throw new ValidationError({ collection: 'seasons', errors: [{ message: `This show already has a season ${number}.`, path: 'number' }] }, req.t)
  return data
}

/**
 * A season of a show (boards 21, 23): "Season One · Tunnel Vision". Episodes pick their season; the show's page groups
 * them by it and names the season holding the newest episode as the one now airing.
 */
export const Seasons: CollectionConfig = {
  slug: 'seasons',
  labels: { singular: 'Season', plural: 'Seasons' },
  access: {
    create: requirePermission('content.write'),
    read: publishedOrContentStaff,
    update: requirePermission('content.write'),
    delete: requirePermission('content.publish'),
  },
  admin: {
    group: 'Content',
    useAsTitle: 'label',
    defaultColumns: ['label', 'production', 'number', 'updatedAt'],
    description: "A show's season. Its episodes pick it (Episode details on the story). A season has no address of its own; it appears on the show's page.",
  },
  versions: { drafts: true },
  hooks: {
    beforeChange: [
      uniqueNumberPerShow,
      ({ data, originalDoc }) => {
        const n = data.number ?? originalDoc?.number
        const t = data.title ?? originalDoc?.title
        return { ...data, label: `Season ${n}${t ? `: ${t}` : ''}` }
      },
    ],
    afterChange: [revalidateShowOf],
  },
  fields: [
    { name: 'production', type: 'relationship', relationTo: 'productions', required: true, index: true, filterOptions: { kind: { equals: 'original' } }, admin: { position: 'sidebar' } },
    { name: 'number', type: 'number', required: true, min: 1, admin: { position: 'sidebar', step: 1, description: 'Shown as "Season One". Used once per show.' } },
    { name: 'title', type: 'text', admin: { description: 'The season\'s theme, e.g. "Tunnel Vision".' } },
    { name: 'summary', type: 'text', admin: { description: 'One line, e.g. "A descent through Pensacola\'s hidden underground."' } },
    { name: 'image', type: 'upload', relationTo: 'media', admin: { description: 'Optional. Behind the show\'s title while this season is airing.' } },
    { name: 'label', type: 'text', admin: { hidden: true }, index: true },
  ],
}
