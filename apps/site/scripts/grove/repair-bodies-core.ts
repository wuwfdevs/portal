// The database half of the body repair (the decisions are in `src/lib/grove/repair.ts`). Kept apart from the command-line script so
// an integration test can run exactly this code against a scratch database.
//
// For every story already in the database that has a Grove id, it compares the stored body with what the converter makes of that
// story's Grove page today. It writes only the body, and only when ALL of these hold:
//   - the body still holds markup typed as words, or the page now has "Related" / "Support" lines the stored body has as paragraphs;
//   - the words a reader would read are identical before and after;
//   - nobody has edited the story since the import (the version history has one version, saved when the story was made);
//   - every picture, audio or video file the new body points at is already in the library (it never creates or fetches a file).
// Anything else is skipped and said so. `apply: false` (the default) writes nothing.

import type { Payload } from 'payload'

import { resolveAssets } from '../../src/lib/grove/assets'
import { editedSinceImport, planRepair } from '../../src/lib/grove/repair'
import type { ConvertedStory } from '../../src/lib/grove/types'

export type RepairVerdict =
  | 'would-repair' // dry run: this body would be replaced
  | 'repaired' // applied
  | 'unchanged' // nothing to repair
  | 'skipped-edited'
  | 'skipped-words-differ'
  | 'skipped-missing-files'
  | 'skipped-no-source-page'
  | 'failed'

export interface RepairRow {
  path: string
  groveId: string
  verdict: RepairVerdict
  detail?: string
  linkLinesAdded?: number
  typedMarkupPieces?: number
}

export interface RepairOptions {
  apply?: boolean
  /** Only stories whose path contains this text. */
  only?: string
  /** Stop after this many stories were repaired (or would be). */
  limit?: number
  log?: (line: string) => void
}

const why = (e: unknown): string => {
  const err = e as { message?: string; data?: { errors?: { path?: string; message?: string }[] } }
  const detail = (err.data?.errors ?? []).map((x) => `${x.path ?? '?'}: ${x.message ?? '?'}`).join('; ')
  return `${err.message ?? String(e)}${detail ? ` [${detail}]` : ''}`.slice(0, 400)
}

type PostDoc = { id: number | string; content?: unknown; createdAt: string; updatedAt: string; legacy?: { groveId?: string | null; legacyPath?: string | null } | null }

export async function repairBodies(payload: Payload, stories: readonly ConvertedStory[], options: RepairOptions = {}): Promise<RepairRow[]> {
  const { apply = false, only, limit = Infinity, log = () => undefined } = options
  const byGroveId = new Map(stories.map((s) => [s.legacy.groveId, s]))
  const libraryIds = new Map<string, number | string | null>()
  const rows: RepairRow[] = []
  let repairs = 0

  /** The library record for a file the importer saved, or null. Read only: this never creates or fetches a file. */
  const libraryId = async (kind: 'image' | 'audio' | 'video', sourceUrl: string): Promise<number | string | null> => {
    if (libraryIds.has(sourceUrl)) return libraryIds.get(sourceUrl)!
    const collection = kind === 'image' ? 'media' : kind
    const found = await payload.find({ collection, where: { 'legacy.sourceUrl': { equals: sourceUrl } } as never, limit: 1, depth: 0, overrideAccess: true })
    const id = found.docs[0]?.id ?? null
    libraryIds.set(sourceUrl, id)
    return id
  }

  for (let page = 1; ; page++) {
    const r = await payload.find({ collection: 'posts', where: { 'legacy.groveId': { exists: true } } as never, depth: 0, limit: 50, page, sort: 'id', overrideAccess: true })
    for (const doc of r.docs as unknown as PostDoc[]) {
      const groveId = doc.legacy?.groveId ?? ''
      const path = doc.legacy?.legacyPath ?? String(doc.id)
      if (only && !path.includes(only)) continue
      if (repairs >= limit) return rows
      const row = (verdict: RepairVerdict, extra: Partial<RepairRow> = {}) => {
        rows.push({ path, groveId, verdict, ...extra })
      }
      const s = byGroveId.get(groveId)
      if (!s) {
        row('skipped-no-source-page', { detail: 'no converted Grove page for this story in the pages given' })
        continue
      }
      const plan = planRepair(doc.content, s.content)
      if (plan.kind === 'same') {
        row('unchanged')
        continue
      }
      if (plan.kind === 'words-differ') {
        row('skipped-words-differ', { detail: 'the words a reader reads would change; left alone' })
        continue
      }
      const counts = { linkLinesAdded: plan.linkLinesAdded, typedMarkupPieces: plan.typedMarkupPieces }
      try {
        const versions = await payload.findVersions({ collection: 'posts', where: { parent: { equals: doc.id } } as never, limit: 1, depth: 0, overrideAccess: true })
        if (editedSinceImport({ versionCount: versions.totalDocs, createdAt: doc.createdAt, updatedAt: doc.updatedAt })) {
          row('skipped-edited', { ...counts, detail: `${versions.totalDocs} versions; changed after the import` })
          continue
        }
        const ids = new Map<string, number | string>()
        const missing: string[] = []
        for (const a of s.assets) {
          const id = await libraryId(a.kind, a.sourceUrl)
          if (id === null) missing.push(a.sourceUrl)
          else ids.set(a.sourceUrl, id)
        }
        if (missing.length) {
          row('skipped-missing-files', { ...counts, detail: `${missing.length} file(s) not in the library, e.g. ${missing[0]}` })
          continue
        }
        const { content } = resolveAssets({ content: s.content }, ids)
        if (!apply) {
          row('would-repair', counts)
          repairs++
          continue
        }
        // The same switch the importer sets: the story's pages are refreshed by the site's own revalidation, not from a script.
        await payload.update({ collection: 'posts', id: doc.id, data: { content } as never, overrideAccess: true, context: { disableRevalidate: true } })
        row('repaired', counts)
        repairs++
        if (repairs % 25 === 0) log(`repaired ${repairs} stories`)
      } catch (e) {
        row('failed', { ...counts, detail: why(e) })
      }
    }
    if (page >= r.totalPages) break
  }
  return rows
}

export function summarizeRepair(rows: readonly RepairRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) out[r.verdict] = (out[r.verdict] ?? 0) + 1
  return out
}
