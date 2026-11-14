import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { CardPostData } from '@/components/Card'

import { RELATED_CANDIDATES, pickRelated, type RelatedCandidate } from './rank'
import { nearestToStory } from './store'

/**
 * "Similar stories" under a story: its stored vector's nearest neighbours, thinned by `pickRelated` (floor, recency, series cap) and
 * loaded through the Local API with access control ON, so only published stories the public may see come back. The query runs when the
 * story page is rendered, and the page is cached and refreshed like any story, so it costs nothing per reader.
 *
 * It never throws: no vector yet (a brand-new story, or before the backfill), no pgvector, or a database error all give an empty list,
 * and the page then simply has no such section. A story page must not fail because a recommendation could not be made.
 */
export async function loadRelatedStories(post: { id: number | string }, now: Date = new Date()): Promise<(CardPostData & { id: number })[]> {
  try {
    const payload = await getPayload({ config: configPromise })
    const neighbours = await nearestToStory(payload, Number(post.id), RELATED_CANDIDATES)
    if (neighbours.length === 0) return []

    const found = await payload.find({
      collection: 'posts',
      depth: 1,
      draft: false,
      limit: neighbours.length,
      overrideAccess: false,
      pagination: false,
      select: { title: true, slug: true, path: true, categories: true, meta: true, publishedAt: true, series: true, production: true, publishingIdentity: true },
      where: { id: { in: neighbours.map((n) => n.postId) } },
    })
    const byId = new Map(found.docs.map((d) => [String(d.id), d]))

    const candidates: RelatedCandidate[] = []
    for (const n of neighbours) {
      const doc = byId.get(String(n.postId))
      if (!doc) continue // not published, or not readable by the public: never offered
      const group = doc.production ?? doc.series
      candidates.push({
        id: doc.id,
        similarity: n.similarity,
        publishedAt: doc.publishedAt ?? null,
        seriesKey: group ? String(typeof group === 'object' ? group.id : group) : null,
      })
    }
    return pickRelated(post.id, candidates, now).flatMap((c) => byId.get(String(c.id)) ?? [])
  } catch (error) {
    console.error('Similar stories could not be loaded', error instanceof Error ? error.message : 'unknown error')
    return []
  }
}
