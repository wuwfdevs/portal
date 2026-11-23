import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Artist, Media, Performance, Video } from '@/payload-types'

import { supportHref } from '@/lib/support-link'

import { appearances, performanceTitle, splitPerformances, ticketInfo, type ArtistAppearance } from './arrange'
import { recordingEmbed } from './recording'

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
  /** A second ticket page for the virtual show, when there is one. */
  virtualTickets: { label: string; href: string } | null
  /** A file with captions kept here, or a video on YouTube or Vimeo shown through the site's embed rules. */
  recording: RecordingView | null
}

export type RecordingView =
  | { kind: 'file'; url: string; mimeType: string | null; posterUrl: string | null; seconds: number | null; captionsHref: string }
  | { kind: 'embed'; src: string; load: 'auto' | 'click'; provider: string }

function toArtist(a: Artist): ArtistView | null {
  return a.slug ? { slug: a.slug, name: a.name, photo: named<Media>(a.photo), bio: a.bio ?? null, link: supportHref(a.link) } : null
}

export function toShow(p: Performance): ShowView | null {
  if (!p.slug) return null
  const lineup = (p.lineup ?? []).map((a) => named<Artist>(a)).flatMap((a) => (a ? [toArtist(a)].filter((x): x is ArtistView => x !== null) : []))
  const photo = named<Media>(p.photo)
  const file = named<Video>(p.video)
  const poster = named<Media>(file?.poster)
  const hasCaptions = Boolean(p.captionsVtt && p.captionsVtt.trim())
  const embedded = recordingEmbed(p.recordingUrl)
  return {
    slug: p.slug,
    title: p.title,
    startsAt: p.startsAt,
    venue: p.venue ?? null,
    lineup,
    description: p.description ?? null,
    photo,
    tickets: ticketInfo(p.ticketsStatus, supportHref(p.ticketsUrl)),
    virtualTickets: supportHref(p.virtualTicketsUrl) ? { label: 'Get virtual tickets', href: supportHref(p.virtualTicketsUrl)! } : null,
    // An uploaded recording is shown only with its captions: the editor cannot publish one without them, and a record that predates the rule shows none.
    // Otherwise a YouTube or Vimeo address, if it is still one the embed rules accept.
    recording:
      file?.url && hasCaptions
        ? { kind: 'file', url: file.url, mimeType: file.mimeType ?? null, posterUrl: (poster ?? photo)?.sizes?.large?.url ?? (poster ?? photo)?.url ?? null, seconds: file.durationSeconds ?? null, captionsHref: `/radiolive/${p.slug}/captions.vtt` }
        : embedded.ok
          ? { kind: 'embed', src: embedded.embed.src, load: embedded.embed.load, provider: embedded.embed.provider }
          : null,
  }
}

/** Every published show, newest first. The public reads published records only. (The RadioLive page itself is sections now; this is what its blocks, the show pages and the home page's panel read.) */
export const loadShows = cache(async (): Promise<ShowView[]> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'performances', depth: 2, draft: false, limit: 500, overrideAccess: false, pagination: false, sort: '-startsAt', where: { _status: { equals: 'published' } } })
  return found.docs.flatMap((p) => {
    const s = toShow(p)
    return s ? [s] : []
  })
})

/** A published show by its address. No funder line: see `ShowPageView`. */
export const loadShow = cache(async (slug: string): Promise<{ show: ShowView } | null> => {
  const show = (await loadShows()).find((s) => s.slug === slug)
  return show ? { show } : null
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
