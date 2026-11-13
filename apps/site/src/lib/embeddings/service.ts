import type { Payload, PayloadRequest } from 'payload'

import { embeddingKey } from './config'
import { openAiProvider, type EmbeddingProvider } from './provider'
import { deleteEmbeddings, storedEmbeddings, upsertEmbedding } from './store'
import { contentHash, embeddingText, skipReason, type EmbeddableStory } from './text'

/**
 * Keeping one story's vector current. Server only. Used by the save hook and by the backfill, so the two cannot disagree about what
 * is embedded, when it is stale, or what is left out.
 */

let cached: { key: string; provider: EmbeddingProvider } | null = null

/** The provider for this server, or null when no key is set (then nothing is embedded and nothing is sent anywhere). */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  const key = embeddingKey()
  if (!key) return null
  if (!cached || cached.key !== key) cached = { key, provider: openAiProvider(key) }
  return cached.provider
}

export type EmbedOutcome = 'embedded' | 'unchanged' | 'skipped'

type Story = EmbeddableStory & { id: number | string }

const idOf = (story: Story): number => Number(story.id)

/**
 * Embeds a story if it is eligible and its text changed since the stored vector was made. One cheap read decides; the provider is called
 * only for a story that needs it, so re-saving a story (a path change, a redirect, a typo in a field that is not embedded) costs nothing.
 *
 * Pass `req` from a save hook: the write then joins the save's own transaction (see `db` in store.ts). It never removes a vector: a draft saved over a published story reports `_status: 'draft'` here, and removing the vector then would
 * drop a live story from "similar stories" until its next publish. A vector for a story that is no longer public is harmless (every
 * reader loads stories through access control) and the backfill prunes it.
 */
export async function embedStory(payload: Payload, story: Story, provider: EmbeddingProvider, req?: Pick<PayloadRequest, 'transactionID'>): Promise<EmbedOutcome> {
  if (skipReason(story) !== null) return 'skipped'
  const id = idOf(story)
  const text = embeddingText(story)
  const hash = contentHash(text, provider.model)
  const stored = (await storedEmbeddings(payload, [id], req)).get(id)
  if (stored && stored.contentHash === hash && stored.model === provider.model) return 'unchanged'
  const [vector] = await provider.embed([text])
  await upsertEmbedding(payload, id, vector, provider.model, hash, req)
  return 'embedded'
}

/** `stale` is how many need (re-)embedding; `embedded` is how many were, so a dry run reports stale and embeds none. */
export type BatchReport = { embedded: number; stale: number; unchanged: number; skipped: number; tokensEstimate: number }

/** Several stories in as few provider calls as possible (the backfill). Returns what was done; a provider failure throws. */
export async function embedStories(payload: Payload, stories: readonly Story[], provider: EmbeddingProvider, options: { dryRun?: boolean } = {}): Promise<BatchReport> {
  const report: BatchReport = { embedded: 0, stale: 0, unchanged: 0, skipped: 0, tokensEstimate: 0 }
  const eligible = stories.filter((s) => skipReason(s) === null)
  report.skipped = stories.length - eligible.length
  const stored = await storedEmbeddings(payload, eligible.map(idOf))

  const todo: { id: number; text: string; hash: string }[] = []
  for (const story of eligible) {
    const text = embeddingText(story)
    const hash = contentHash(text, provider.model)
    const have = stored.get(idOf(story))
    if (have && have.contentHash === hash && have.model === provider.model) report.unchanged++
    else todo.push({ id: idOf(story), text, hash })
  }
  report.stale = todo.length
  report.tokensEstimate = Math.ceil(todo.reduce((n, t) => n + t.text.length, 0) / 4)
  if (options.dryRun || todo.length === 0) return report

  const vectors = await provider.embed(todo.map((t) => t.text))
  for (let i = 0; i < todo.length; i++) await upsertEmbedding(payload, todo[i].id, vectors[i], provider.model, todo[i].hash)
  report.embedded = todo.length
  return report
}

/** Deletes vectors for stories that are no longer public or no longer ours. Returns how many. */
export async function pruneEmbeddings(payload: Payload, postIds: readonly number[]): Promise<number> {
  await deleteEmbeddings(payload, postIds)
  return postIds.length
}
