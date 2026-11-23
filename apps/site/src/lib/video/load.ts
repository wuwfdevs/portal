import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Clip, Contributor, Media, Series, Video } from '@/payload-types'

import { getSeriesHubAcknowledgments } from '@/lib/underwriting/load'
import type { AcknowledgmentLine } from '@/lib/underwriting/resolve'

import { isVoyagerIdentity } from '@/lib/voyager/identity'
import { ctaLabelOf, groupIntoRows, nextClip, type ClipRow } from './clips'

const named = <T extends object>(v: T | string | number | null | undefined): T | null => (v && typeof v === 'object' ? v : null)

/** A clip as the pages show it: relations opened, nothing the public may not see. */
export interface ClipView {
  id: string | number
  slug: string
  title: string
  description: string | null
  videoUrl: string
  mimeType: string | null
  posterUrl: string | null
  durationSeconds: number | null
  /** "Leigh Ostrander", else the video file's credit. */
  by: string | null
  publishedAt: string | null
  series: { id: string | number; slug: string; title: string } | null
  /** The story or episode it came from, when that is published. */
  story: { href: string; label: string } | null
  /** The section of that story: where the clip belongs on a section page. A clip has none of its own, so one with no story has no section. */
  sectionId: string | number | null
  captionsHref: string
  /** The story it came from was published under The Voyager's identity: a Voyager page shows only these. */
  voyager: boolean
}

function toView(clip: Clip): ClipView | null {
  const file = named<Video>(clip.video)
  if (!file?.url || !clip.slug) return null
  const poster = named<Media>(file.poster)
  const series = named<Series>(clip.series)
  const story = named<{ path?: string | null; section?: { id: string | number } | string | number | null; publishingIdentity?: unknown }>(clip.story as never)
  const section = story?.section
  const people = (clip.contributors ?? []).map((c) => named<Contributor>(c)?.name).filter((n): n is string => Boolean(n))
  return {
    id: clip.id,
    slug: clip.slug,
    title: clip.title,
    description: clip.description ?? null,
    videoUrl: file.url,
    mimeType: file.mimeType ?? null,
    posterUrl: poster?.sizes?.large?.url ?? poster?.url ?? null,
    durationSeconds: file.durationSeconds ?? null,
    by: people.length > 0 ? people.join(', ') : (file.credit ?? null),
    publishedAt: clip.publishedAt ?? null,
    series: series?.slug ? { id: series.id, slug: series.slug, title: series.title } : null,
    story: story?.path ? { href: story.path, label: ctaLabelOf(clip.ctaLabel) } : null,
    sectionId: section == null ? null : typeof section === 'object' ? section.id : section,
    captionsHref: `/video/${clip.slug}/captions.vtt`,
    voyager: isVoyagerIdentity(story?.publishingIdentity),
  }
}

/** Every published clip, newest first. The public reads published clips only. */
export const loadClips = cache(async (): Promise<ClipView[]> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'clips', depth: 2, draft: false, limit: 300, overrideAccess: false, pagination: false, sort: '-publishedAt', where: { _status: { equals: 'published' } },
    // A story is populated with a few fields only (its `defaultPopulate`); a clip needs its story's address and its section.
    populate: { posts: { path: true, section: true, publishingIdentity: true } },
  })
  return found.docs.flatMap((c) => {
    const v = toView(c)
    return v ? [v] : []
  })
})

export interface ClipPage {
  clip: ClipView
  acknowledgments: AcknowledgmentLine[]
  /** The clips after this one, for "Up next". */
  queue: ClipView[]
  next: ClipView | null
  rows: ClipRow<ClipView>[]
}

const QUEUE = 4

/** A clip by its slug (the newest when no slug is given), with what the page shows around it. Null when there is no such published clip. */
export const loadClipPage = cache(async (slug: string | null): Promise<ClipPage | null> => {
  const all = await loadClips()
  const clip = slug === null ? all[0] : all.find((c) => c.slug === slug)
  if (!clip) return null
  const payload = await getPayload({ config: configPromise })
  const acknowledgments = clip.series ? await getSeriesHubAcknowledgments(payload, clip.series.id, new Date().toISOString()) : []
  const at = all.findIndex((c) => c.slug === clip.slug)
  const queue = [...all.slice(at + 1), ...all.slice(0, at)].slice(0, QUEUE)
  return {
    clip,
    acknowledgments,
    queue,
    next: nextClip(all, clip.slug),
    rows: groupIntoRows(all.map((c) => ({ ...c, series: c.series ? { slug: c.series.slug, title: c.series.title } : null }))) as unknown as ClipRow<ClipView>[],
  }
})

/** The captions of a published clip, or null. */
export async function loadCaptions(slug: string): Promise<string | null> {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'clips', depth: 0, draft: false, limit: 1, overrideAccess: false, pagination: false, select: { captionsVtt: true }, where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] } })
  return found.docs[0]?.captionsVtt ?? null
}
