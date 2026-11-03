import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Contributor, Production, Section } from '@/payload-types'

import { CARD_FIELDS, type HomeStory } from '@/lib/homepage/load'

import { latestRail, staffRole } from './arrange'

const named = <T extends object>(v: T | string | number | null | undefined): T | null => (v && typeof v === 'object' ? v : null)
const idOf = (v: { id: string | number } | string | number | null | undefined): string | number | null => (v == null ? null : typeof v === 'object' ? v.id : v)

export interface VoyagerData {
  tagline: string | null
  featured: HomeStory | null
  latest: HomeStory[]
  sections: { section: Section; stories: HomeStory[] }[]
  videos: HomeStory[]
  podcast: { id: string | number; title: string; tagline: string | null; summary: string | null; path: string } | null
  staff: { person: Contributor; role: string }[]
  join: { heading: string; text: string | null; href: string | null }
  footnote: string | null
}

export const LATEST_COUNT = 5
const PER_SECTION = 2
const VIDEO_COUNT = 2

/**
 * Everything The Voyager's hub shows, or null when the hub is not set up (no publishing identity chosen). The stories are the
 * ones published under that identity; every read goes through access control, so only published work appears and a pick that was
 * unpublished afterwards falls away.
 */
export const loadVoyagerHub = cache(async (): Promise<VoyagerData | null> => {
  const payload = await getPayload({ config: configPromise })
  const settings = await payload.findGlobal({ slug: 'voyager-hub', depth: 1, overrideAccess: false })
  const identityId = idOf(settings.identity as never)
  if (identityId === null) return null

  const mine = { publishingIdentity: { equals: identityId } }
  const stories = (where: Record<string, unknown>, limit: number) =>
    payload.find({ collection: 'posts', depth: 1, draft: false, limit, overrideAccess: false, pagination: false, select: CARD_FIELDS, sort: '-publishedAt', where: { and: [mine, where] } as never }).then((r) => r.docs as HomeStory[])

  const sectionDocs = (settings.sections ?? []).map((s) => named<Section>(s as never)).filter((s): s is Section => s !== null)
  const featuredId = idOf(settings.featured as never)
  const podcastDoc = named<Production>(settings.podcast as never)

  const [recent, pick, perSection, videos] = await Promise.all([
    stories({}, LATEST_COUNT + 1),
    featuredId !== null ? stories({ id: { equals: featuredId } }, 1) : Promise.resolve([] as HomeStory[]),
    Promise.all(sectionDocs.map((s) => stories({ section: { equals: s.id } }, PER_SECTION))),
    stories({ format: { equals: 'video' } }, VIDEO_COUNT),
  ])

  const featured = pick[0] ?? recent[0] ?? null
  const staff = (settings.staff ?? [])
    .map((m) => {
      const person = named<Contributor>(m.person as never)
      return person ? { person, role: staffRole(m.role, person.title) } : null
    })
    .filter((m): m is { person: Contributor; role: string } => m !== null)

  return {
    tagline: settings.tagline?.trim() || null,
    featured,
    latest: latestRail(recent, featured?.id ?? null, LATEST_COUNT),
    sections: sectionDocs.map((section, i) => ({ section, stories: perSection[i] ?? [] })),
    videos,
    podcast: podcastDoc && podcastDoc.path ? { id: podcastDoc.id, title: podcastDoc.title, tagline: podcastDoc.tagline ?? null, summary: podcastDoc.summary ?? null, path: podcastDoc.path } : null,
    staff,
    join: { heading: settings.join?.heading?.trim() || 'Write for The Voyager', text: settings.join?.text?.trim() || null, href: settings.join?.href?.trim() || null },
    footnote: settings.footnote?.trim() || null,
  }
})
