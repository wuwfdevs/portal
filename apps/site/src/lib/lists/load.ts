import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Contributor } from '@/payload-types'

import { CARD_FIELDS, type HomeStory } from '@/lib/homepage/load'

import { PAGE_SIZE, type ListKind, type ListRequest } from './route'

export interface StoryListData {
  kind: ListKind
  slug: string
  title: string
  /** A section's description, a person's job title, or nothing. */
  blurb: string | null
  /** For a person: their bio. */
  bio: string | null
  stories: HomeStory[]
  page: number
  totalPages: number
  totalDocs: number
}

/**
 * One page of the stories in a section, a topic or by a person, newest first, or null when there is no such list or the
 * page is past the last. Every read goes through access control, so only published work can appear.
 */
export const loadStoryList = cache(async (kind: ListKind, slug: string, page: number): Promise<StoryListData | null> => {
  const payload = await getPayload({ config: configPromise })

  let title = ''
  let blurb: string | null = null
  let bio: string | null = null
  let id: string | number
  let where: Record<string, unknown>

  if (kind === 'section') {
    const s = (await payload.find({ collection: 'sections', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: false })).docs[0]
    if (!s) return null
    ;({ id, title } = s)
    blurb = s.description?.trim() || null
    where = { section: { equals: id } }
  } else if (kind === 'topic') {
    const t = (await payload.find({ collection: 'categories', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: false })).docs[0]
    if (!t) return null
    ;({ id, title } = t)
    where = { categories: { equals: id } }
  } else {
    const p = (await payload.find({ collection: 'contributors', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: false })).docs[0] as Contributor | undefined
    if (!p) return null
    id = p.id
    title = p.name
    blurb = p.title?.trim() || null
    bio = p.bio?.trim() || null
    where = { contributors: { equals: id } }
  }

  const result = await payload.find({
    collection: 'posts',
    depth: 1,
    draft: false,
    limit: PAGE_SIZE,
    overrideAccess: false,
    page,
    select: CARD_FIELDS,
    sort: '-publishedAt',
    where: where as never,
  })
  // A page past the last is a 404, but an empty first page is a real (empty) list.
  if (page > 1 && result.docs.length === 0) return null
  return { kind, slug, title, blurb, bio, stories: result.docs as HomeStory[], page, totalPages: Math.max(1, result.totalPages), totalDocs: result.totalDocs }
})

export const loadStoryListFor = (req: ListRequest) => loadStoryList(req.kind, req.slug, req.page)
