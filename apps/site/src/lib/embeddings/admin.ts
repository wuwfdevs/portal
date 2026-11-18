import type { Payload } from 'payload'

import { embeddingKey } from './config'
import { neighbourCandidates } from './related'
import { pickRelated } from './rank'
import { getEmbeddingProvider, embedStories } from './service'
import { embeddingCoverage, missingPostIds, sampleEmbeddedPostIds } from './store'
import type { EmbeddingTuning } from './tuning'

/**
 * What the admin panel under Site settings does (the endpoints are in `globals/storyEmbeddingEndpoints.ts`). Server only. It is the
 * backfill script's job without a terminal: the same eligibility, text and staleness rules (`service.ts`), a batch at a time so each
 * request finishes quickly on a serverless host, and a cursor so the panel can keep going.
 *
 * It sends story text to the embedding provider, so it is available only to people who hold `settings.manage` (checked by the endpoint),
 * and only when the key is set. It never returns a key, a story's text, or a vector.
 */

/** Stories per request: one provider call, finishing well inside a serverless time limit. */
export const EMBED_BATCH = 20

export type EmbeddingStatus = { keySet: boolean; eligible: number; embedded: number; waiting: number }

export async function embeddingStatus(payload: Payload): Promise<EmbeddingStatus> {
  const { eligible, embedded } = await embeddingCoverage(payload)
  return { keySet: embeddingKey() !== null, eligible, embedded, waiting: Math.max(0, eligible - embedded) }
}

export type BatchResult =
  | { ok: true; embedded: number; leftOut: number; lastId: number; done: boolean; status: EmbeddingStatus }
  | { ok: false; error: string; status: EmbeddingStatus }

/** Embeds the next `EMBED_BATCH` stories without a vector that come after `afterId`. Stories already current are not touched or paid for. */
export async function embedNextBatch(payload: Payload, afterId: number): Promise<BatchResult> {
  const provider = getEmbeddingProvider()
  if (!provider) return { ok: false, error: 'OPENAI_API_KEY is not set on the server, so nothing can be embedded.', status: await embeddingStatus(payload) }

  const ids = await missingPostIds(payload, afterId, EMBED_BATCH)
  if (ids.length === 0) return { ok: true, embedded: 0, leftOut: 0, lastId: afterId, done: true, status: await embeddingStatus(payload) }

  // overrideAccess: this is a server-side staff operation that must read members-only bodies' flag and drafts' published state; the text
  // rules (`embeddingText`) decide what leaves the server, exactly as in the backfill.
  const found = await payload.find({
    collection: 'posts',
    depth: 0,
    draft: false,
    limit: ids.length,
    pagination: false,
    overrideAccess: true,
    select: { title: true, dek: true, meta: true, content: true, membersOnly: true, source: true, _status: true },
    where: { and: [{ id: { in: ids } }, { _status: { equals: 'published' } }, { source: { equals: 'wuwf' } }] },
  })
  const lastId = ids[ids.length - 1]
  try {
    const report = await embedStories(payload, found.docs, provider)
    return { ok: true, embedded: report.embedded, leftOut: report.skipped, lastId, done: ids.length < EMBED_BATCH, status: await embeddingStatus(payload) }
  } catch (error) {
    // The message names an HTTP status at most (never the request, which holds story text, or the key).
    console.error('Embedding batch failed', error instanceof Error ? error.message : 'unknown error')
    return { ok: false, error: error instanceof Error ? error.message : 'The embedding service did not answer.', status: await embeddingStatus(payload) }
  }
}

export type ExampleNeighbour = { title: string; path: string; similarity: number; shown: boolean }
export type Example = { title: string; path: string; neighbours: ExampleNeighbour[] }

/**
 * A few stories picked at random, each with its closest stories and which of them the given tuning would show under it. Uses the same
 * loading and picking as a story page (`neighbourCandidates`, `pickRelated`), so what an editor sees here is what readers get.
 * Read with access control on: a story the public cannot read is not shown.
 */
export async function neighbourExamples(payload: Payload, tuning: EmbeddingTuning, count = 5, now: Date = new Date()): Promise<Example[]> {
  const examples: Example[] = []
  // Ask for more than needed: a sampled story may be one the public cannot read (a vector is kept for a story that was unpublished).
  for (const id of await sampleEmbeddedPostIds(payload, count * 2)) {
    if (examples.length >= count) break
    const { docs } = await payload.find({ collection: 'posts', depth: 0, draft: false, limit: 1, overrideAccess: false, pagination: false, select: { title: true, path: true }, where: { id: { equals: id } } })
    const self = docs[0]
    if (!self?.path) continue
    const { candidates, byId } = await neighbourCandidates(payload, id)
    const shown = new Set(pickRelated(id, candidates, now, { minSimilarity: tuning.relatedMinSimilarity, maxPerSeries: tuning.relatedMaxPerSeries }).map((c) => String(c.id)))
    const neighbours: ExampleNeighbour[] = []
    for (const c of candidates.slice(0, 8)) {
      const doc = byId.get(String(c.id))
      if (!doc?.path || !doc.title) continue
      neighbours.push({ title: doc.title, path: doc.path, similarity: Math.round(c.similarity * 100) / 100, shown: shown.has(String(c.id)) })
    }
    examples.push({ title: self.title ?? 'Untitled', path: self.path, neighbours })
  }
  return examples
}
