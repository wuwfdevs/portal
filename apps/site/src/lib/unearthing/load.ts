import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Media, Post, Production, Series, Site } from '@/payload-types'

import { CARD_FIELDS, type HomeStory } from '@/lib/homepage/load'
import { audioOf, type Episode } from '@/lib/shows/load'
import { getProductionHubAcknowledgments } from '@/lib/underwriting/load'
import type { AcknowledgmentLine } from '@/lib/underwriting/resolve'

import { clampPercent, collectionsOf, periodCounts, sitesWithEpisodes, type EpisodeCollection, type EpisodeRef, type SiteRef } from './group'
import type { Era } from './periods'

const named = <T extends object>(v: T | string | number | null | undefined): T | null => (v && typeof v === 'object' ? v : null)
const idOf = (v: { id: string | number } | string | number | null | undefined): string | number | null => (v == null ? null : typeof v === 'object' ? v.id : v)

export interface UnearthingData {
  production: Production
  heroImage: Media | null
  dateline: string | null
  about: string | null
  acknowledgments: AcknowledgmentLine[]
  featured: Episode | null
  totalEpisodes: number
  sites: (SiteRef & { count: number; episodes: EpisodeRef[] })[]
  periods: ReturnType<typeof periodCounts>
  collections: EpisodeCollection[]
  thenNow: { heading: string | null; blurb: string | null; pairs: { then: HomeStory; now: HomeStory }[] }
}

const EPISODE_FIELDS = { ...CARD_FIELDS, featuredAudio: true } as const
const REF_FIELDS = { title: true, path: true, publishedAt: true, period: true, site: true, series: true } as const
/** Far more than the show has; a hub that outgrows it should page, not silently cut. */
const MAX_EPISODES = 2000

/**
 * Everything the Unearthing Florida hub shows, or null when the hub is not set up (no production chosen, or it does not exist).
 * Every read goes through access control, so only published work appears whatever an editor picked; a pick that has been
 * unpublished simply falls away and the slot is filled from the newest episode.
 */
export const loadUnearthingHub = cache(async (): Promise<UnearthingData | null> => {
  const payload = await getPayload({ config: configPromise })
  const settings = await payload.findGlobal({ slug: 'unearthing-hub', depth: 0, overrideAccess: false })
  const productionId = idOf(settings.production as never)
  if (productionId === null) return null
  const production = (await payload.find({ collection: 'productions', where: { id: { equals: productionId } }, depth: 1, limit: 1, overrideAccess: false })).docs[0]
  if (!production) return null

  const mine = { production: { equals: production.id } }
  const featuredId = idOf(settings.featured as never)
  const pairIds = (settings.thenNow?.pairs ?? []).flatMap((p) => [idOf(p.then as never), idOf(p.now as never)]).filter((v): v is string | number => v !== null)

  const [refs, siteDocs, featuredPick, newest, paired, acknowledgments] = await Promise.all([
    payload.find({ collection: 'posts', depth: 1, draft: false, limit: MAX_EPISODES, overrideAccess: false, pagination: false, select: REF_FIELDS, sort: '-publishedAt', where: mine as never }),
    payload.find({ collection: 'sites', depth: 0, limit: 200, overrideAccess: false, pagination: false, sort: 'name' }),
    featuredId !== null ? payload.find({ collection: 'posts', depth: 1, draft: false, limit: 1, overrideAccess: false, select: EPISODE_FIELDS, where: { and: [mine, { id: { equals: featuredId } }] } as never }) : Promise.resolve(null),
    payload.find({ collection: 'posts', depth: 1, draft: false, limit: 1, overrideAccess: false, select: EPISODE_FIELDS, sort: '-publishedAt', where: mine as never }),
    pairIds.length ? payload.find({ collection: 'posts', depth: 1, draft: false, limit: pairIds.length, overrideAccess: false, pagination: false, select: CARD_FIELDS, where: { id: { in: pairIds } } as never }) : Promise.resolve({ docs: [] }),
    getProductionHubAcknowledgments(payload, production.id, new Date().toISOString()),
  ])

  const episodes: EpisodeRef[] = (refs.docs as Pick<Post, 'id' | 'title' | 'path' | 'publishedAt' | 'period' | 'site' | 'series'>[]).map((p) => {
    const series = named<Series>(p.series as never)
    return { id: p.id, title: p.title, path: p.path ?? null, publishedAt: p.publishedAt ?? null, period: p.period ?? null, siteId: idOf(p.site as never), series: series ? { id: series.id, title: series.title, slug: series.slug ?? null } : null }
  })

  const sites: SiteRef[] = siteDocs.docs.map((s: Site) => ({
    id: s.id,
    name: s.name,
    short: s.short?.trim() || s.name,
    place: s.place,
    era: s.era as Era,
    description: s.description?.trim() || null,
    x: clampPercent(s.mapX ?? 50),
    y: clampPercent(s.mapY ?? 50),
  }))

  const byId = new Map((paired.docs as HomeStory[]).map((s) => [String(s.id), s]))
  const pairs = (settings.thenNow?.pairs ?? [])
    .map((p) => ({ then: byId.get(String(idOf(p.then as never))), now: byId.get(String(idOf(p.now as never))) }))
    .filter((p): p is { then: HomeStory; now: HomeStory } => Boolean(p.then && p.now))

  return {
    production,
    heroImage: named<Media>(production.heroImage),
    dateline: settings.dateline?.trim() || null,
    about: settings.about?.trim() || null,
    acknowledgments,
    featured: ((featuredPick?.docs[0] ?? newest.docs[0]) as Episode | undefined) ?? null,
    totalEpisodes: refs.totalDocs ?? episodes.length,
    sites: sitesWithEpisodes(sites, episodes),
    periods: periodCounts(episodes),
    collections: collectionsOf(episodes),
    thenNow: { heading: settings.thenNow?.heading?.trim() || null, blurb: settings.thenNow?.blurb?.trim() || null, pairs },
  }
})

export { audioOf }
