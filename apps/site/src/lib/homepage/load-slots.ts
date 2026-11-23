import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Media, Production } from '@/payload-types'

import { splitPerformances } from '@/lib/radiolive/arrange'
import { loadShows, type ShowView } from '@/lib/radiolive/load'
import { loadDirectory, type Episode } from '@/lib/shows/load'
import { getProductionHubAcknowledgments } from '@/lib/underwriting/load'
import type { AcknowledgmentLine } from '@/lib/underwriting/resolve'

import { CARD_FIELDS } from './story'
import { pickPodcasts, pickRadioLive } from './slots'

const named = <T extends object>(v: T | string | number | null | undefined): T | null => (v && typeof v === 'object' ? v : null)
const idOf = (v: { id: string | number } | string | number | null | undefined): string | number | null => (v == null ? null : typeof v === 'object' ? v.id : v)

const EPISODE_FIELDS = { ...CARD_FIELDS, featuredAudio: true } as const
export const OTHER_SHOWS = 3

export interface PodcastCard {
  show: Production
  heroImage: Media | null
  episodes: number
  latest: Episode | null
}

export interface HomepageSlots {
  podcasts: { featured: PodcastCard & { latest: Episode }; acknowledgments: AcknowledgmentLine[]; others: PodcastCard[] } | null
  radioLive: { tagline: string | null; next: ShowView | null; latest: ShowView | null } | null
  unearthing: { production: Production; heroImage: Media | null; episode: Episode } | null
}

/** The podcasts slot: the pinned show (or the one with the newest episode), its funder lines, and the shows beside it. Null when no listed show has an episode. */
export async function loadPodcastsSlot(featuredShowId: string | number | null, only?: readonly (string | number)[]): Promise<HomepageSlots['podcasts']> {
  const payload = await getPayload({ config: configPromise })
  const { shows: all } = await loadDirectory()
  // `only` scopes the slot to chosen shows (The Voyager's): the featured show and the others are drawn from them alone. Still only listed shows, since the directory is.
  const shows = only ? all.filter((row) => only.some((id) => String(id) === String(row.show.id))) : all
  const picked = pickPodcasts(shows, { featuredId: featuredShowId, othersCount: OTHER_SHOWS })
  if (!picked) return null
  const acknowledgments = await getProductionHubAcknowledgments(payload, picked.featured.show.id, new Date().toISOString())
  return { featured: picked.featured, acknowledgments, others: picked.others }
}

/**
 * The RadioLive panel: the next show and the newest recorded set, from the shows themselves, with the line under the name taken from the RadioLive page's own description (the page is
 * sections now; the old `radiolive-hub` global is read by nothing). Null when there is neither a coming show nor a recorded one.
 */
export async function loadRadioLiveSlot(): Promise<HomepageSlots['radioLive']> {
  const payload = await getPayload({ config: configPromise })
  const [shows, page] = await Promise.all([
    loadShows(),
    payload.find({ collection: 'pages', where: { and: [{ path: { equals: '/radiolive' } }, { pageSet: { equals: 'radiolive' } }] }, limit: 1, depth: 0, draft: false, overrideAccess: false, pagination: false, select: { meta: true } }),
  ])
  const { upcoming, past } = splitPerformances(shows, new Date())
  const picked = pickRadioLive({ upcoming, latest: past.find((s) => s.recording) ?? null })
  const description = page.docs[0]?.meta?.description?.trim() || null
  return picked ? { tagline: description, ...picked } : null
}

/**
 * The Unearthing Florida panel. Only the one episode is read, not the whole show: the editor's pick, else the newest. Null when no show has an Unearthing home page or the show has no published episode.
 */
export async function loadUnearthingSlot(pickedEpisodeId: string | number | null): Promise<HomepageSlots['unearthing']> {
  const payload = await getPayload({ config: configPromise })
  // The show is the one whose home page is a page of the unearthing set (the old `unearthing-hub` global is read by nothing).
  const home = await payload.find({ collection: 'pages', where: { and: [{ pageSet: { equals: 'unearthing' } }, { isShowHome: { equals: true } }] }, limit: 1, depth: 0, draft: false, overrideAccess: false, pagination: false, select: { show: true } })
  const productionId = idOf(home.docs[0]?.show as never)
  if (productionId === null) return null
  const production = (await payload.find({ collection: 'productions', where: { id: { equals: productionId } }, depth: 1, limit: 1, overrideAccess: false })).docs[0]
  if (!production) return null
  const mine = { production: { equals: production.id } }
  const one = async (id: string | number | null): Promise<Episode | null> => {
    const where = id === null ? mine : { and: [mine, { id: { equals: id } }] }
    const found = await payload.find({ collection: 'posts', depth: 1, draft: false, limit: 1, overrideAccess: false, pagination: false, select: EPISODE_FIELDS, sort: '-publishedAt', where: where as never })
    return (found.docs[0] as Episode | undefined) ?? null
  }
  const episode = (pickedEpisodeId !== null ? await one(pickedEpisodeId) : null) ?? (await one(null))
  return episode ? { production, heroImage: named<Media>(production.heroImage), episode } : null
}
