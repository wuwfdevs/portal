import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Audio, Contributor, Media, Post, Production } from '@/payload-types'

import { CARD_FIELDS, type HomeStory } from '@/lib/homepage/load'
import { getProductionHubAcknowledgments } from '@/lib/underwriting/load'
import type { AcknowledgmentLine } from '@/lib/underwriting/resolve'

import { showLine } from './line'

const named = <T extends object>(v: T | string | number | null | undefined): T | null => (v && typeof v === 'object' ? v : null)

/** An episode: a story with audio that belongs to a show. */
export type Episode = HomeStory & { featuredAudio?: Post['featuredAudio'] }

const EPISODE_FIELDS = { ...CARD_FIELDS, featuredAudio: true } as const
export const EPISODES_PER_PAGE = 20

export interface ShowData {
  show: Production
  hosts: Contributor[]
  heroImage: Media | null
  line: string | null
  /** Newest first. */
  episodes: Episode[]
  totalEpisodes: number
  acknowledgments: AcknowledgmentLine[]
  /** Other shows in the directory, for "More WUWF originals". */
  others: Pick<Production, 'id' | 'title' | 'path' | 'tagline'>[]
}

const episodesOf = (showId: string | number) => ({ production: { equals: showId }, format: { equals: 'audio' } })

/** A show by its address, or null. Reads go through access control; only published episodes appear. */
export const loadShowByPath = cache(async (path: string): Promise<ShowData | null> => {
  const payload = await getPayload({ config: configPromise })
  const show = (await payload.find({ collection: 'productions', where: { path: { equals: path } }, limit: 1, depth: 2, overrideAccess: false })).docs[0]
  if (!show) return null
  const [eps, others, acknowledgments] = await Promise.all([
    payload.find({ collection: 'posts', depth: 1, draft: false, limit: EPISODES_PER_PAGE, overrideAccess: false, select: EPISODE_FIELDS, sort: '-publishedAt', where: episodesOf(show.id) as never }),
    payload.find({ collection: 'productions', depth: 0, limit: 8, overrideAccess: false, pagination: false, select: { title: true, path: true, tagline: true }, sort: 'title', where: { and: [{ listed: { equals: true } }, { id: { not_equals: show.id } }, { path: { exists: true } }] } }),
    getProductionHubAcknowledgments(payload, show.id, new Date().toISOString()),
  ])
  const hosts = (show.hosts ?? []).map((h) => named<Contributor>(h)).filter((h): h is Contributor => h !== null)
  return {
    show,
    hosts,
    heroImage: named<Media>(show.heroImage),
    line: showLine({ hosts: hosts.map((h) => h.name), schedule: show.schedule, episodes: eps.totalDocs }),
    episodes: eps.docs as Episode[],
    totalEpisodes: eps.totalDocs,
    acknowledgments,
    others: others.docs.filter((o): o is typeof o & { path: string } => typeof o.path === 'string'),
  }
})

export interface DirectoryData {
  shows: { show: Production; heroImage: Media | null; episodes: number; latest: Episode | null }[]
  latestEpisodes: (Episode & { showTitle: string | null })[]
}

/** The podcast directory: every listed show with its episode count and newest episode, and the newest episodes across all of them. */
export const loadDirectory = cache(async (): Promise<DirectoryData> => {
  const payload = await getPayload({ config: configPromise })
  const shows = (await payload.find({ collection: 'productions', where: { and: [{ listed: { equals: true } }, { path: { exists: true } }] }, depth: 1, limit: 100, overrideAccess: false, pagination: false, sort: 'title' })).docs
  const rows = await Promise.all(
    shows.map(async (show) => {
      const [count, latest] = await Promise.all([
        payload.count({ collection: 'posts', overrideAccess: false, where: episodesOf(show.id) as never }),
        payload.find({ collection: 'posts', depth: 1, draft: false, limit: 1, overrideAccess: false, select: EPISODE_FIELDS, sort: '-publishedAt', where: episodesOf(show.id) as never }),
      ])
      return { show, heroImage: named<Media>(show.heroImage), episodes: count.totalDocs, latest: (latest.docs[0] as Episode | undefined) ?? null }
    }),
  )
  const listedIds = shows.map((s) => s.id)
  const newest = listedIds.length
    ? await payload.find({ collection: 'posts', depth: 1, draft: false, limit: 12, overrideAccess: false, select: { ...EPISODE_FIELDS, production: true }, sort: '-publishedAt', where: { and: [{ format: { equals: 'audio' } }, { production: { in: listedIds } }] } as never })
    : { docs: [] }
  const titleOf = new Map(shows.map((s) => [String(s.id), s.title]))
  return {
    shows: rows,
    latestEpisodes: (newest.docs as (Episode & { production?: Post['production'] })[]).map((e) => ({ ...e, showTitle: titleOf.get(String(typeof e.production === 'object' && e.production ? e.production.id : e.production)) ?? null })),
  }
})

/** The audio file on an episode when it was loaded, or null. */
export const audioOf = (e: Pick<Episode, 'featuredAudio'>): Audio | null => named<Audio>(e.featuredAudio as never)
