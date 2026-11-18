import { extractResources, parseDocumentsResponse } from './cds'
import { buildNewStoriesQuery, buildRecheckQueries, CDS_MAX_WINDOW, classifyRecheck, nextCursor, type SourceFinder } from './poll'
import type { NetworkCandidate } from './types'

/**
 * One poll of one source. Pure orchestration: CDS and the database are injected, so it is tested without either (`sync.test.ts`).
 *
 * Two questions per run (see `poll.ts` for why): what was published since the cursor, and are the stories we already hold still there,
 * still unrestricted, and what do they say now. A failure never throws out of here: it is recorded on the source and the cursor stays put,
 * so the next run asks the same question again. One bad source does not stop the others.
 */

export type SourceToSync = {
  id: number | string
  name: string
  finder: SourceFinder
  mode: 'auto' | 'queue'
  /** Where the last run got to; null on a source's first run. */
  cursor: Date | null
}

export interface CdsReader {
  /** `GET /v1/documents?<query>`, parsed JSON. Throws on a non-2xx answer. */
  get(query: string): Promise<unknown>
}

export interface SyncStore {
  /** Saves what was found. A story we already hold is refreshed (never created twice); a dismissed one is left alone. Returns the CDS ids that are new. */
  upsertCandidates(sourceId: SourceToSync['id'], candidates: NetworkCandidate[], now: Date): Promise<{ created: string[]; updated: string[] }>
  /** CDS ids of this source's stories still worth checking (waiting, kept or published; not dismissed or gone), most recently seen first. */
  heldIds(sourceId: SourceToSync['id'], limit: number): Promise<string[]>
  /** Stories CDS no longer returns. A published one is flagged for an editor; nothing is removed. */
  markGone(cdsIds: string[], now: Date): Promise<void>
  /** Stories now flagged restricted: a published post is unpublished, and the candidate's content is cleared. */
  takeDown(cdsIds: string[], now: Date): Promise<void>
}

export type RunRecord = {
  lastPolledAt: Date
  cursor: Date
  foundNew: number
  skippedRestricted: number
  error: string | null
}

export type SyncDeps = {
  cds: CdsReader
  store: SyncStore
  now?: () => Date
  /** How far back a source's first run looks. */
  firstRunLookbackHours?: number
  /** Pages of 100 per run, so one run stays inside a request's time. */
  maxPages?: number
  /** How many held stories one run re-checks. */
  recheckLimit?: number
}

export type SyncResult = {
  found: number
  created: string[]
  updated: number
  restricted: number
  malformed: number
  notStory: number
  gone: number
  takenDown: number
  cursor: Date
  /** New stories in a source set to publish on its own. They are queued until publishing from CDS exists. */
  awaitingAutoPublish: string[]
  error: string | null
  run: RunRecord
}

const PAGE = 100

export async function syncSource(source: SourceToSync, deps: SyncDeps): Promise<SyncResult> {
  const now = (deps.now ?? (() => new Date()))()
  const since = source.cursor ?? new Date(now.getTime() - (deps.firstRunLookbackHours ?? 72) * 3_600_000)
  const maxPages = Math.min(deps.maxPages ?? 5, Math.floor(CDS_MAX_WINDOW / PAGE))

  const result: SyncResult = {
    found: 0,
    created: [],
    updated: 0,
    restricted: 0,
    malformed: 0,
    notStory: 0,
    gone: 0,
    takenDown: 0,
    cursor: since,
    awaitingAutoPublish: [],
    error: null,
    run: { lastPolledAt: now, cursor: since, foundNew: 0, skippedRestricted: 0, error: null },
  }

  try {
    // 1. What was published since the cursor.
    const found: NetworkCandidate[] = []
    for (let page = 0; page < maxPages; page += 1) {
      const body = await deps.cds.get(buildNewStoriesQuery(source.finder, { since, offset: page * PAGE, limit: PAGE }))
      const parsed = parseDocumentsResponse(body, now)
      result.restricted += parsed.restricted
      result.malformed += parsed.malformed
      result.notStory += parsed.notStory
      found.push(...parsed.candidates)
      if (extractResources(body).length < PAGE) break
    }
    result.found = found.length
    if (found.length > 0) {
      const saved = await deps.store.upsertCandidates(source.id, found, now)
      result.created = saved.created
      result.updated = saved.updated.length
      if (source.mode === 'auto') result.awaitingAutoPublish = saved.created
    }
    result.cursor = nextCursor(found, since)

    // 2. The stories we already hold: still there, still unrestricted, and what they say now.
    const held = await deps.store.heldIds(source.id, deps.recheckLimit ?? 200)
    if (held.length > 0) {
      const answers = []
      for (const query of buildRecheckQueries(held)) answers.push(parseDocumentsResponse(await deps.cds.get(query), now))
      const outcome = classifyRecheck(held, answers)
      if (outcome.present.length > 0) {
        const refreshed = await deps.store.upsertCandidates(source.id, outcome.present, now)
        result.updated += refreshed.updated.length
      }
      if (outcome.restricted.length > 0) await deps.store.takeDown(outcome.restricted, now)
      if (outcome.gone.length > 0) await deps.store.markGone(outcome.gone, now)
      result.takenDown = outcome.restricted.length
      result.gone = outcome.gone.length
    }
  } catch (error) {
    // Keep the cursor where it was: nothing found this run is lost, because the next run asks the same question.
    result.error = error instanceof Error ? error.message : 'The check failed.'
    result.cursor = since
  }

  result.run = { lastPolledAt: now, cursor: result.cursor, foundNew: result.created.length, skippedRestricted: result.restricted, error: result.error }
  return result
}
