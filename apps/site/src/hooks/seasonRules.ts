import { ValidationError, type CollectionAfterChangeHook, type CollectionBeforeChangeHook } from 'payload'

import { revalidatePath } from '../lib/revalidate'
import { showPagePaths } from '../lib/shows/subpaths'

const idOf = (v: unknown): string | number | null =>
  v && typeof v === 'object' && 'id' in v ? (v as { id: string | number }).id : typeof v === 'string' || typeof v === 'number' ? v : null

/**
 * An episode's season and number (boards 21, 23): the season must be one of its own show's, and two episodes of a season
 * cannot share a number. Trailers and bonus episodes may repeat or skip a number.
 */
export const episodeSeasonRules: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const pick = <K extends string>(k: K) => (k in data ? data[k] : originalDoc?.[k])
  const season = idOf(pick('season'))
  if (season === null) return data
  const show = idOf(pick('production'))
  const found = await req.payload.findByID({ collection: 'seasons', id: season, depth: 0, overrideAccess: true, req, select: { production: true } }).catch(() => null)
  if (!found || show === null || String(idOf(found.production)) !== String(show)) {
    throw new ValidationError({ collection: 'posts', errors: [{ message: "That season belongs to another show. Pick one of this story's own show's seasons.", path: 'season' }] }, req.t)
  }
  const number = pick('episodeNumber')
  const type = pick('episodeType') ?? 'full'
  if (typeof number !== 'number' || type !== 'full') return data
  const clash = await req.payload.find({
    collection: 'posts',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    select: { title: true },
    where: { and: [{ season: { equals: season } }, { episodeNumber: { equals: number } }, { episodeType: { equals: 'full' } }, ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : [])] },
  })
  if (clash.docs[0]) {
    throw new ValidationError({ collection: 'posts', errors: [{ message: `Episode ${number} of this season is already "${clash.docs[0].title}".`, path: 'episodeNumber' }] }, req.t)
  }
  return data
}

/** Saving a season refreshes its show's pages. */
export const revalidateShowOf: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (req.context.disableRevalidate) return doc
  const show = idOf(doc.production)
  if (show === null) return doc
  const found = await req.payload.findByID({ collection: 'productions', id: show, depth: 0, overrideAccess: true, req, select: { path: true } }).catch(() => null)
  if (found?.path) for (const p of showPagePaths(found.path)) revalidatePath(p)
  return doc
}
