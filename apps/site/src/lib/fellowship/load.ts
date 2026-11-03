import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Contributor, Fellowship, Media, Post } from '@/payload-types'

import { getFellowshipHubAcknowledgments } from '@/lib/underwriting/load'
import type { AcknowledgmentLine } from '@/lib/underwriting/resolve'

import { statsLine, type FellowshipCounts } from './stats'

const named = <T extends object>(value: T | string | number | null | undefined): T | null => (value && typeof value === 'object' ? value : null)

export type HubStory = Pick<Post, 'id' | 'path' | 'categories' | 'meta' | 'title' | 'publishedAt' | 'format'>

export interface FellowshipHubData {
  fellowship: Fellowship
  fellow: Contributor | null
  heroImage: Media | null
  counts: FellowshipCounts
  stats: string | null
  /** Newest first. The first is shown large; all of them are listed under "All work". */
  stories: HubStory[]
  acknowledgments: AcknowledgmentLine[]
}

/** How many stories the hub lists before it stops. The page says how many there are in all. */
export const HUB_STORY_LIMIT = 12

/**
 * Everything the hub page needs, or null when no fellowship has that address. Public reads go through access control
 * (`overrideAccess: false`), so a draft or unpublished story never reaches a visitor; the funder lines are read on the
 * server from records the public cannot read, and only the approved wording comes back.
 */
export const loadFellowshipHub = cache(async (slug: string): Promise<FellowshipHubData | null> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'fellowships', where: { slug: { equals: slug } }, limit: 1, depth: 2, overrideAccess: false })
  const fellowship = found.docs[0]
  if (!fellowship) return null

  const inFellowship = { fellowship: { equals: fellowship.id } }
  const countOf = (extra: Record<string, unknown>) =>
    payload.count({ collection: 'posts', overrideAccess: false, where: { and: [inFellowship, extra] } as never }).then((r) => r.totalDocs)

  const [stories, all, episodes, videos, acknowledgments] = await Promise.all([
    payload.find({
      collection: 'posts',
      depth: 1,
      draft: false,
      limit: HUB_STORY_LIMIT,
      overrideAccess: false,
      pagination: false,
      sort: '-publishedAt',
      select: { title: true, path: true, categories: true, meta: true, publishedAt: true, format: true },
      where: inFellowship,
    }),
    payload.count({ collection: 'posts', overrideAccess: false, where: inFellowship }).then((r) => r.totalDocs),
    countOf({ format: { equals: 'audio' } }),
    countOf({ format: { equals: 'video' } }),
    getFellowshipHubAcknowledgments(payload, fellowship.id, new Date().toISOString()),
  ])

  // "Stories" counts the written pieces; episodes and videos are counted by what they are.
  const counts: FellowshipCounts = { stories: Math.max(0, all - episodes - videos), episodes, videos }
  return {
    fellowship,
    fellow: named<Contributor>(fellowship.fellow),
    heroImage: named<Media>(fellowship.heroImage),
    counts,
    stats: statsLine(counts, fellowship.termStartsOn),
    stories: stories.docs as HubStory[],
    acknowledgments,
  }
})
