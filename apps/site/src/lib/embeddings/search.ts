import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { postKind, type SearchKind } from '@/lib/search/query'

import { MAX_QUERY_CHARS, semanticSearchAllowed } from './config'
import { MIN_SEARCH_SIMILARITY } from './rank'
import { getEmbeddingProvider } from './service'
import { nearestToVector } from './store'

/**
 * Semantic search: stories whose meaning is close to the search words, found by embedding the query and asking for the nearest stored
 * vectors. Server only. Off unless the Site settings switch "Find stories by meaning in search" is on AND a key is set: the visitor's search
 * words go to the embedding provider, which is the owner's decision (ROADMAP: Needs the owner), so a key alone never turns it on.
 *
 * Privacy: the query text is never logged, stored or put in analytics; it is sent to the provider as the input of one embedding request
 * and kept (as its vector, under its normalised text) in this process's memory for an hour so a repeated search is not sent again.
 *
 * Never throws. A provider timeout or error gives no semantic results and the page shows its keyword results alone.
 */

export type SemanticHit = {
  id: string
  title: string | null
  path: string | null
  kind: SearchKind
  publishedAt: string | null
  meta: { description: string | null }
  similarity: number
}

const QUERY_TIMEOUT_MS = 3000
const CACHE_LIMIT = 200
const CACHE_TTL_MS = 60 * 60 * 1000
const cache = new Map<string, { vector: number[]; at: number }>()

const normalise = (q: string) => q.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, MAX_QUERY_CHARS)

async function queryVector(q: string): Promise<number[] | null> {
  const key = normalise(q)
  if (key === '') return null
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.vector
  const provider = getEmbeddingProvider()
  if (!provider) return null
  const [vector] = await provider.embed([key], { signal: AbortSignal.timeout(QUERY_TIMEOUT_MS) })
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  cache.set(key, { vector, at: Date.now() })
  return vector
}

/** `settingOn` is the Site settings switch, read by the caller (the search page reads the cached global); without it, or without a key, nothing is sent. */
export async function semanticStories(q: string, options: { settingOn: boolean | null | undefined; kinds?: readonly SearchKind[]; limit?: number }): Promise<SemanticHit[]> {
  if (!semanticSearchAllowed(options.settingOn)) return []
  const limit = options.limit ?? 20
  try {
    const vector = await queryVector(q)
    if (!vector) return []
    const payload = await getPayload({ config: configPromise })
    // Ask for more than needed: the kind filter and the similarity floor both thin the list.
    const neighbours = (await nearestToVector(payload, vector, limit * 3)).filter((n) => n.similarity >= MIN_SEARCH_SIMILARITY)
    if (neighbours.length === 0) return []

    const found = await payload.find({
      collection: 'posts',
      depth: 0,
      draft: false,
      limit: neighbours.length,
      overrideAccess: false,
      pagination: false,
      select: { title: true, path: true, format: true, production: true, publishedAt: true, meta: true },
      where: { id: { in: neighbours.map((n) => n.postId) } },
    })
    const byId = new Map(found.docs.map((d) => [String(d.id), d]))

    const hits: SemanticHit[] = []
    for (const n of neighbours) {
      const doc = byId.get(String(n.postId))
      if (!doc?.path) continue // not published or not readable: never offered
      const kind = postKind(doc)
      if (options.kinds && !options.kinds.includes(kind)) continue
      hits.push({
        id: `semantic-${doc.id}`,
        title: doc.title ?? null,
        path: doc.path,
        kind,
        publishedAt: doc.publishedAt ?? null,
        meta: { description: doc.meta?.description ?? null },
        similarity: n.similarity,
      })
      if (hits.length >= limit) break
    }
    return hits
  } catch (error) {
    // The message only: an error object can carry the request body, which holds the visitor's words.
    console.error('Semantic search failed', error instanceof Error ? error.name : 'unknown error')
    return []
  }
}
