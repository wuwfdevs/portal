import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import { SECTION_REVALIDATE, sectionClock } from '@/lib/section-data/load'

import { dateParts, performanceTitle } from './arrange'
import { toShow } from './load'

/** The newest show that is over and has a recording to watch, shaped for a Feature's video frame. Plain JSON (it is cached). */
export interface LatestSet {
  title: string
  /** "Nov 6, 2026". */
  when: string
  description: string | null
  /** The show's own page. */
  href: string
  /** The still: the show's picture (`Media`), or null. */
  photo: unknown
  frame: { kind: 'file'; url: string; mimeType: string | null; captionsHref: string } | { kind: 'embed'; src: string }
}

/**
 * The latest recorded RadioLive set (hubs redesign, slice 4: the RadioLive page's lead follows the shows, so nobody edits it each month). A show has a recording once it has a file with captions
 * or an address on YouTube or Vimeo the embed rules accept (`toShow`); the newest of those that are over. Published shows only (access control on). Cached with the dates' window, since
 * "over" depends on the clock; a failed read throws and is never cached.
 */
const read = async (nowIso: string): Promise<LatestSet | null> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({
    collection: 'performances',
    where: { and: [{ startsAt: { less_than: nowIso } }, { or: [{ recordingUrl: { exists: true } }, { video: { exists: true } }] }] },
    depth: 2,
    limit: 8,
    pagination: false,
    sort: '-startsAt',
    overrideAccess: false,
    draft: false,
  })
  for (const p of found.docs) {
    const show = toShow(p)
    const rec = show?.recording
    if (!show || !rec) continue
    return {
      title: performanceTitle(show),
      when: dateParts(show.startsAt).long,
      description: show.description,
      href: `/radiolive/${show.slug}`,
      photo: show.photo,
      frame: rec.kind === 'file' ? { kind: 'file', url: rec.url, mimeType: rec.mimeType, captionsHref: rec.captionsHref } : { kind: 'embed', src: rec.src },
    }
  }
  return null
}

const cached = unstable_cache(read, ['radiolive-latest-set'], { revalidate: SECTION_REVALIDATE.dates, tags: ['section-data', 'section-data:dates', 'radiolive'] })

export async function loadLatestSet(): Promise<LatestSet | null> {
  return cached(await sectionClock())
}
