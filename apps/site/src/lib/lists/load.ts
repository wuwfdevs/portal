import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Contributor, Media } from '@/payload-types'

import { CARD_FIELDS, type HomeStory } from '@/lib/homepage/load'
import { publicIdFromInput } from '@/lib/listening/placement'

import { PAGE_SIZE, type ListKind, type ListRequest } from './route'

/** What a person's page shows above their stories. Only a person has one. */
export interface PersonProfile {
  initials: string
  photo: Media | null
  biography: Contributor['biography'] | null
  links: { label: string; url: string }[]
}

export interface StoryListData {
  kind: ListKind
  slug: string
  title: string
  /** A section's description, a person's job title, or nothing. */
  blurb: string | null
  /** A section's colour (`sections.swatch`), for the heading's highlight; null for every other list. */
  swatch: string | null
  /** For a person: their bio. */
  bio: string | null
  profile: PersonProfile | null
  /** A topic's WUWF Listens question (its public id), asked at the head of the first page. Only a topic has one. */
  listeningQuestion: string | null
  /** The section's, topic's or reporter's id, for aiming a placement at this page; null for the list of every story. */
  targetId: string | number | null
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
  let swatch: string | null = null
  let bio: string | null = null
  let profile: PersonProfile | null = null
  let listeningQuestion: string | null = null
  let id: string | number
  let where: Record<string, unknown>

  if (kind === 'latest') {
    // Every published story, whatever its section or origin (WUWF's own, NPR, wire and partner work). The home page's lead and
    // Briefing still come from WUWF's own work; this page is the whole archive, newest first.
    id = 0
    title = 'All stories'
    blurb = 'Everything WUWF has published, newest first.'
    where = {}
  } else if (kind === 'section') {
    const s = (await payload.find({ collection: 'sections', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: false })).docs[0]
    if (!s) return null
    ;({ id, title } = s)
    blurb = s.description?.trim() || null
    swatch = s.swatch ?? null
    where = { section: { equals: id } }
  } else if (kind === 'topic') {
    const t = (await payload.find({ collection: 'categories', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: false })).docs[0]
    if (!t) return null
    ;({ id, title } = t)
    listeningQuestion = publicIdFromInput(t.listeningQuestion)
    where = { categories: { equals: id } }
  } else {
    const p = (await payload.find({ collection: 'contributors', where: { slug: { equals: slug } }, limit: 1, depth: 1, overrideAccess: false })).docs[0] as Contributor | undefined
    if (!p) return null
    id = p.id
    title = p.name
    blurb = p.title?.trim() || null
    bio = p.bio?.trim() || null
    profile = {
      initials: p.initials || p.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(''),
      photo: typeof p.photo === 'object' && p.photo ? p.photo : null,
      biography: p.biography ?? null,
      links: (p.links ?? []).map((l) => ({ label: l.label, url: l.url })),
    }
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
  return { kind, slug, title, blurb, swatch, bio, profile, listeningQuestion, targetId: kind === 'latest' ? null : id, stories: result.docs as HomeStory[], page, totalPages: Math.max(1, result.totalPages), totalDocs: result.totalDocs }
})

export const loadStoryListFor = (req: ListRequest) => loadStoryList(req.kind, req.slug, req.page)
