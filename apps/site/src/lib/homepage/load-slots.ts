import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Homepage, Media, Production } from '@/payload-types'

import { loadRadioLive, type ShowView } from '@/lib/radiolive/load'
import { loadDirectory, type Episode } from '@/lib/shows/load'
import { getProductionHubAcknowledgments } from '@/lib/underwriting/load'
import type { AcknowledgmentLine } from '@/lib/underwriting/resolve'
import { loadClips, type ClipView } from '@/lib/video/load'

import { CARD_FIELDS } from './load'
import { pickClips, pickPodcasts, pickRadioLive, videoCount } from './slots'

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
  video: { clips: ClipView[] } | null
  podcasts: { featured: PodcastCard & { latest: Episode }; acknowledgments: AcknowledgmentLine[]; others: PodcastCard[] } | null
  radioLive: { tagline: string | null; next: ShowView | null; latest: ShowView | null } | null
  unearthing: { production: Production; heroImage: Media | null; episode: Episode } | null
}

/**
 * The feature slots below the news (boards 1 and 2). Each is read through access control, so only published work appears; each is
 * left out (null) when an editor switched it off or it has nothing to show. A slot that fails to load is left out and logged, so the
 * front page never goes down because a feature did: the news above it does not depend on any of them.
 */
export async function loadHomepageSlots(): Promise<HomepageSlots> {
  const payload = await getPayload({ config: configPromise })
  const settings: Homepage = await payload.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: false })
  const on = (g: { enabled?: boolean | null } | null | undefined): boolean => g?.enabled !== false

  const settle = async <T>(name: string, load: () => Promise<T>): Promise<T | null> => {
    try {
      return await load()
    } catch (err) {
      payload.logger.error({ err, msg: `Home page: the ${name} slot could not be loaded and is left out` })
      return null
    }
  }

  const video = async (): Promise<HomepageSlots['video']> => {
    const clips = pickClips(await loadClips(), { seriesId: idOf(settings.videoRow?.series as never), count: videoCount(settings.videoRow?.count) })
    return clips.length > 0 ? { clips } : null
  }

  const podcasts = async (): Promise<HomepageSlots['podcasts']> => {
    const { shows } = await loadDirectory()
    const picked = pickPodcasts(shows, { featuredId: idOf(settings.podcasts?.featuredShow as never), othersCount: OTHER_SHOWS })
    if (!picked) return null
    const acknowledgments = await getProductionHubAcknowledgments(payload, picked.featured.show.id, new Date().toISOString())
    return { featured: picked.featured, acknowledgments, others: picked.others }
  }

  const radioLive = async (): Promise<HomepageSlots['radioLive']> => {
    const data = await loadRadioLive()
    const picked = pickRadioLive({ upcoming: data.upcoming, latest: data.latest })
    return picked ? { tagline: data.tagline, ...picked } : null
  }

  // Only the one episode is read, not the whole hub: the editor's pick when it belongs to the series, else the hub's featured episode, else the newest.
  const unearthing = async (): Promise<HomepageSlots['unearthing']> => {
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
    const homePick = idOf(settings.unearthing?.episode as never)
    const hubPick = idOf(hub.featured as never)
    const episode = (homePick !== null ? await one(homePick) : null) ?? (hubPick !== null ? await one(hubPick) : null) ?? (await one(null))
    return episode ? { production, heroImage: named<Media>(production.heroImage), episode } : null
  }

  const [v, p, r, u] = await Promise.all([
    on(settings.videoRow) ? settle('short-video', video) : null,
    on(settings.podcasts) ? settle('podcasts', podcasts) : null,
    on(settings.radioLive) ? settle('RadioLive', radioLive) : null,
    on(settings.unearthing) ? settle('Unearthing Florida', unearthing) : null,
  ])
  return { video: v, podcasts: p, radioLive: r, unearthing: u }
}
