import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Media, Production } from '@/payload-types'

import { loadRadioLive, type ShowView } from '@/lib/radiolive/load'
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

/** The RadioLive panel: the next show and the newest recorded set. Null when there is neither. */
export async function loadRadioLiveSlot(): Promise<HomepageSlots['radioLive']> {
  const data = await loadRadioLive()
  const picked = pickRadioLive({ upcoming: data.upcoming, latest: data.latest })
  return picked ? { tagline: data.tagline, ...picked } : null
}

/**
 * The Unearthing Florida panel. Only the one episode is read, not the whole hub: the editor's pick when it belongs to the series, else the hub's featured episode, else
 * the newest. Null when the hub has no series or the series has no published episode.
 */
export async function loadUnearthingSlot(pickedEpisodeId: string | number | null): Promise<HomepageSlots['unearthing']> {
  const payload = await getPayload({ config: configPromise })
  const hub = await payload.findGlobal({ slug: 'unearthing-hub', depth: 0, overrideAccess: false })
  const productionId = idOf(hub.production as never)
  if (productionId === null) return null
  const production = (await payload.find({ collection: 'productions', where: { id: { equals: productionId } }, depth: 1, limit: 1, overrideAccess: false })).docs[0]
  if (!production) return null
  const mine = { production: { equals: production.id } }
  const one = async (id: string | number | null): Promise<Episode | null> => {
    const where = id === null ? mine : { and: [mine, { id: { equals: id } }] }
    const found = await payload.find({ collection: 'posts', depth: 1, draft: false, limit: 1, overrideAccess: false, pagination: false, select: EPISODE_FIELDS, sort: '-publishedAt', where: where as never })
    return (found.docs[0] as Episode | undefined) ?? null
  }
  const hubPick = idOf(hub.featured as never)
  const episode = (pickedEpisodeId !== null ? await one(pickedEpisodeId) : null) ?? (hubPick !== null ? await one(hubPick) : null) ?? (await one(null))
  return episode ? { production, heroImage: named<Media>(production.heroImage), episode } : null
}
