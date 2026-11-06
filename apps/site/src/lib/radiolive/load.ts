import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Artist, Media, Performance, Video } from '@/payload-types'

import { getProductionHubAcknowledgments } from '@/lib/underwriting/load'
import type { AcknowledgmentLine } from '@/lib/underwriting/resolve'
import { supportHref } from '@/lib/support-link'

import { appearances, performanceTitle, splitPerformances, ticketInfo, type ArtistAppearance } from './arrange'

const named = <T extends object>(v: T | string | number | null | undefined): T | null => (v && typeof v === 'object' ? v : null)

export interface ArtistView {
  slug: string
  name: string
  photo: Media | null
  bio: string | null
  link: string | null
}

export interface ShowView {
  slug: string
  title: string
  startsAt: string
  venue: string | null
  lineup: ArtistView[]
  description: string | null
  photo: Media | null
  tickets: { label: string; href: string | null }
  recording: { url: string; mimeType: string | null; posterUrl: string | null; seconds: number | null; captionsHref: string } | null
}

function toArtist(a: Artist): ArtistView | null {
  return a.slug ? { slug: a.slug, name: a.name, photo: named<Media>(a.photo), bio: a.bio ?? null, link: supportHref(a.link) } : null
}

function toShow(p: Performance): ShowView | null {
  if (!p.slug) return null
  const lineup = (p.lineup ?? []).map((a) => named<Artist>(a)).flatMap((a) => (a ? [toArtist(a)].filter((x): x is ArtistView => x !== null) : []))
  const photo = named<Media>(p.photo)
  const file = named<Video>(p.video)
  const poster = named<Media>(file?.poster)
  const hasCaptions = Boolean(p.captionsVtt && p.captionsVtt.trim())
  return {
    slug: p.slug,
    title: p.title,
    startsAt: p.startsAt,
    venue: p.venue ?? null,
    lineup,
    description: p.description ?? null,
    photo,
    tickets: ticketInfo(p.ticketsStatus, supportHref(p.ticketsUrl)),
    // A recording is shown only with its captions: the editor cannot publish one without them, and a record that predates the rule shows none.
    recording: file?.url && hasCaptions ? { url: file.url, mimeType: file.mimeType ?? null, posterUrl: (poster ?? photo)?.sizes?.large?.url ?? (poster ?? photo)?.url ?? null, seconds: file.durationSeconds ?? null, captionsHref: `/radiolive/${p.slug}/captions.vtt` } : null,
  }
}

/** Every published show, newest first. The public reads published records only. */
const loadShows = cache(async (): Promise<ShowView[]> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'performances', depth: 2, draft: false, limit: 500, overrideAccess: false, pagination: false, sort: '-startsAt', where: { _status: { equals: 'published' } } })
  return found.docs.flatMap((p) => {
    const s = toShow(p)
    return s ? [s] : []
  })
})

export interface RadioLiveData {
  tagline: string | null
  heroPhoto: Media | null
  host: { kicker: string | null; heading: string | null; text: string | null; portrait: Media | null; href: string | null }
  encores: { heading: string | null; text: string | null; linkLabel: string | null; href: string | null }
  support: { heading: string | null; text: string | null; buttonLabel: string | null; href: string | null; note: string | null }
  acknowledgments: AcknowledgmentLine[]
  /** Soonest first. */
  upcoming: ShowView[]
  /** The newest recorded set among the past shows, if any. */
  latest: ShowView | null
  /** Past shows with a recording, newest first, cut for the page. */
  watch: ShowView[]
  watchTotal: number
  artists: (ArtistAppearance & { photo: Media | null })[]
}

export const WATCH_COUNT = 6
export const ARTIST_COUNT = 12

const text = (v: string | null | undefined): string | null => v?.trim() || null

/** Everything the RadioLive page shows. Always returns something: an empty station has an empty page, not an error. */
export const loadRadioLive = cache(async (): Promise<RadioLiveData> => {
  const payload = await getPayload({ config: configPromise })
  const [settings, shows] = await Promise.all([payload.findGlobal({ slug: 'radiolive-hub', depth: 1, overrideAccess: false }), loadShows()])
  const production = named<{ id: string | number }>(settings.production as never)
  const acknowledgments = production ? await getProductionHubAcknowledgments(payload, production.id, new Date().toISOString()) : []
  const { upcoming, past } = splitPerformances(shows, new Date())
  const recorded = past.filter((s) => s.recording)
  const photoOf = new Map<string, Media | null>()
  for (const s of shows) for (const a of s.lineup) if (!photoOf.has(a.slug)) photoOf.set(a.slug, a.photo)
  return {
    tagline: text(settings.tagline),
    heroPhoto: named<Media>(settings.heroPhoto),
    host: { kicker: text(settings.host?.kicker), heading: text(settings.host?.heading), text: text(settings.host?.text), portrait: named<Media>(settings.host?.portrait), href: supportHref(settings.host?.href) },
    encores: { heading: text(settings.encores?.heading), text: text(settings.encores?.text), linkLabel: text(settings.encores?.linkLabel), href: supportHref(settings.encores?.href) },
    support: { heading: text(settings.support?.heading), text: text(settings.support?.text), buttonLabel: text(settings.support?.buttonLabel), href: supportHref(settings.support?.href), note: text(settings.support?.note) },
    acknowledgments,
    upcoming,
    latest: recorded[0] ?? null,
    watch: recorded.slice(0, WATCH_COUNT),
    watchTotal: recorded.length,
    // Artists who have played a show that is over; an artist only on a coming bill is not yet "an artist of RadioLive" on this page.
    artists: appearances(past).slice(0, ARTIST_COUNT).map((a) => ({ ...a, photo: photoOf.get(a.slug) ?? null })),
  }
})

export const loadShow = cache(async (slug: string): Promise<{ show: ShowView; acknowledgments: AcknowledgmentLine[] } | null> => {
  const show = (await loadShows()).find((s) => s.slug === slug)
  if (!show) return null
  const payload = await getPayload({ config: configPromise })
  const settings = await payload.findGlobal({ slug: 'radiolive-hub', depth: 0, overrideAccess: false })
  const productionId = typeof settings.production === 'object' ? settings.production?.id : settings.production
  return { show, acknowledgments: productionId ? await getProductionHubAcknowledgments(payload, productionId, new Date().toISOString()) : [] }
})

export const loadArtist = cache(async (slug: string): Promise<{ artist: ArtistView; shows: ShowView[]; appearance: ArtistAppearance | null } | null> => {
  const shows = (await loadShows()).filter((s) => s.lineup.some((a) => a.slug === slug))
  const artist = shows[0]?.lineup.find((a) => a.slug === slug)
  if (!artist) return null
  const { past } = splitPerformances(shows, new Date())
  return { artist, shows, appearance: appearances(past).find((a) => a.slug === slug) ?? null }
})

/** The captions of a published show's recording, or null. */
export async function loadShowCaptions(slug: string): Promise<string | null> {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'performances', depth: 0, draft: false, limit: 1, overrideAccess: false, pagination: false, select: { captionsVtt: true }, where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] } })
  return found.docs[0]?.captionsVtt ?? null
}

export { performanceTitle }
