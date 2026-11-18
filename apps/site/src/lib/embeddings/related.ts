import configPromise from '@payload-config'
import { getPayload, type Payload } from 'payload'

import type { Post } from '@/payload-types'

import { RELATED_CANDIDATES, pickRelated, type RelatedCandidate } from './rank'
import { nearestToStory } from './store'
import { DEFAULT_TUNING, type EmbeddingTuning } from './tuning'

/** A similar story as the page needs it: what a card needs, plus the date, series and show that "More like this" says things about. */
export type RelatedStory = Pick<Post, 'id' | 'path' | 'title' | 'categories' | 'meta' | 'publishedAt' | 'series' | 'production'> &
  Partial<Pick<Post, 'format' | 'publishingIdentity' | 'featuredAudio'>>

/**
 * "Similar stories" under a story: its stored vector's nearest neighbours, thinned by `pickRelated` (floor, recency, series cap) and
 * loaded through the Local API with access control ON, so only published stories the public may see come back. The query runs when the
 * story page is rendered, and the page is cached and refreshed like any story, so it costs nothing per reader.
 *
 * `tuning` is the editors' setting (Site settings), already clamped by `resolveTuning`; the default is the starting values in `rank.ts`.
 *
 * It never throws: no vector yet (a brand-new story, or before the backfill), no pgvector, or a database error all give an empty list,
 * and the page then simply has no such section. A story page must not fail because a recommendation could not be made.
 */
export async function loadRelatedStories(post: { id: number | string }, now: Date = new Date(), tuning: EmbeddingTuning = DEFAULT_TUNING): Promise<RelatedStory[]> {
  try {
    const payload = await getPayload({ config: configPromise })
    const { candidates, byId } = await neighbourCandidates(payload, post.id)
    return pickRelated(post.id, candidates, now, { minSimilarity: tuning.relatedMinSimilarity, maxPerSeries: tuning.relatedMaxPerSeries }).flatMap((c) => byId.get(String(c.id)) ?? [])
  } catch (error) {
    console.error('Similar stories could not be loaded', error instanceof Error ? error.message : 'unknown error')
    return []
  }
}

/**
 * A story's nearest neighbours that the public may read, as candidates for `pickRelated` plus the stories themselves. The one place that
 * turns vectors into readable stories, shared by the story page and the admin's examples, so what an editor sees there is what a reader
 * gets. Loaded with access control ON: a draft or unpublished neighbour is dropped. Throws on a database error (callers decide).
 */
export async function neighbourCandidates(payload: Payload, postId: number | string) {
  const neighbours = await nearestToStory(payload, Number(postId), RELATED_CANDIDATES)
  const byId = new Map<string, Awaited<ReturnType<typeof readNeighbours>>[number]>()
  const candidates: RelatedCandidate[] = []
  if (neighbours.length === 0) return { candidates, byId }

  for (const doc of await readNeighbours(payload, neighbours.map((n) => n.postId))) byId.set(String(doc.id), doc)
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
  return { candidates, byId }
}

async function readNeighbours(payload: Payload, ids: number[]) {
  const found = await payload.find({
    collection: 'posts',
    depth: 1,
    draft: false,
    limit: ids.length,
    overrideAccess: false,
    pagination: false,
    select: { title: true, slug: true, path: true, categories: true, meta: true, publishedAt: true, series: true, production: true, publishingIdentity: true, featuredAudio: true },
    where: { id: { in: ids } },
  })
  return found.docs
}
