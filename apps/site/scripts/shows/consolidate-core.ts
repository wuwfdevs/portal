// The database half of moving shows and their episodes to /shows (the plan is in `src/lib/shows/consolidate.ts`). Kept apart from the
// command-line script so an integration test runs exactly this code against a scratch database.
//
// For each show at a Grove address (`/show/<slug>` or `/podcast/<slug>`): every episode under that address moves first, then the show.
// The address hooks on stories and shows write one permanent redirect per old address (and repoint any redirect that pointed at it), so
// nothing linked or indexed breaks. Episodes go first so that a run stopped half-way is finished by running it again: the show is still
// at its old address, and episodes already moved are recognised as moved. `apply: false` (the default) writes nothing.

import type { Payload } from 'payload'

import { SHOWS_PREFIX, movedEpisodePath, planShowMoves } from '../../src/lib/shows/consolidate'

export type MoveVerdict =
  | 'would-move' // dry run
  | 'moved'
  | 'already-moved' // an episode already under the new address (an earlier run)
  | 'left-alone' // an episode of the show that is not under its old address (e.g. filed under a section): not touched
  | 'skipped-taken' // the new address belongs to another record
  | 'skipped-clash' // two shows would land on the same address
  | 'skipped-episodes' // the show stays, because one of its episodes could not move
  | 'failed'

export interface MoveRow {
  kind: 'show' | 'episode'
  id: string | number
  from: string
  to: string | null
  verdict: MoveVerdict
  detail?: string
}

export interface ConsolidateOptions {
  apply?: boolean
  /** Only shows whose current address contains this text (try one show first). */
  only?: string
  log?: (line: string) => void
}

const PATH_COLLECTIONS = ['posts', 'pages', 'productions', 'events'] as const
const ctx = { disableRevalidate: true }

/** Whether any record other than `self` already has this address. */
async function taken(payload: Payload, path: string, self: { collection: (typeof PATH_COLLECTIONS)[number]; id: string | number }): Promise<boolean> {
  for (const collection of PATH_COLLECTIONS) {
    const where = collection === self.collection ? { and: [{ path: { equals: path } }, { id: { not_equals: self.id } }] } : { path: { equals: path } }
    if ((await payload.count({ collection, where: where as never, overrideAccess: true })).totalDocs > 0) return true
  }
  return false
}

export async function consolidateShows(payload: Payload, opts: ConsolidateOptions = {}): Promise<MoveRow[]> {
  const log = opts.log ?? (() => undefined)
  const rows: MoveRow[] = []
  const push = (row: MoveRow) => {
    rows.push(row)
    log(`${row.verdict.padEnd(16)} ${row.kind.padEnd(7)} ${row.from}${row.to ? ` -> ${row.to}` : ''}${row.detail ? `  (${row.detail})` : ''}`)
  }

  const shows = await payload.find({ collection: 'productions', depth: 0, limit: 0, pagination: false, overrideAccess: true, select: { path: true }, where: { path: { exists: true } } })
  const plan = planShowMoves(shows.docs.map((s) => ({ id: s.id, path: s.path })))
  const picked = (from: string) => !opts.only || from.includes(opts.only)
  for (const clash of plan.clashes) for (const s of clash.shows.filter((c) => picked(c.from))) push({ kind: 'show', id: s.id, from: s.from, to: clash.to, verdict: 'skipped-clash', detail: `${clash.shows.length} shows would share this address; rename one first` })

  for (const move of plan.moves.filter((m) => picked(m.from))) {
    if (await taken(payload, move.to, { collection: 'productions', id: move.id })) {
      push({ kind: 'show', id: move.id, from: move.from, to: move.to, verdict: 'skipped-taken', detail: 'another page or story has this address' })
      continue
    }

    // Every story of the show, drafts included: a draft that has an address keeps it in step with the show.
    const episodes = await payload.find({ collection: 'posts', depth: 0, limit: 0, pagination: false, overrideAccess: true, draft: true, select: { path: true }, where: { production: { equals: move.id } } as never })
    let blocked = false
    for (const ep of episodes.docs) {
      const from = ep.path ?? ''
      if (from.startsWith(`${move.to}/`)) {
        push({ kind: 'episode', id: ep.id, from, to: null, verdict: 'already-moved' })
        continue
      }
      const to = movedEpisodePath(from, move.from, move.to)
      if (!to) {
        push({ kind: 'episode', id: ep.id, from: from || '(no address)', to: null, verdict: 'left-alone', detail: 'not under the show\'s address' })
        continue
      }
      if (await taken(payload, to, { collection: 'posts', id: ep.id })) {
        push({ kind: 'episode', id: ep.id, from, to, verdict: 'skipped-taken', detail: 'another page or story has this address' })
        blocked = true
        continue
      }
      if (!opts.apply) {
        push({ kind: 'episode', id: ep.id, from, to, verdict: 'would-move' })
        continue
      }
      try {
        await payload.update({ collection: 'posts', id: ep.id, data: { path: to } as never, overrideAccess: true, context: ctx })
        push({ kind: 'episode', id: ep.id, from, to, verdict: 'moved' })
      } catch (err) {
        push({ kind: 'episode', id: ep.id, from, to, verdict: 'failed', detail: err instanceof Error ? err.message : String(err) })
        blocked = true
      }
    }

    // A show whose episodes did not all move stays where it is, so a second run can finish it.
    if (blocked) {
      push({ kind: 'show', id: move.id, from: move.from, to: move.to, verdict: 'skipped-episodes', detail: 'fix the episodes above, then run again' })
      continue
    }
    if (!opts.apply) {
      push({ kind: 'show', id: move.id, from: move.from, to: move.to, verdict: 'would-move' })
      continue
    }
    try {
      await payload.update({ collection: 'productions', id: move.id, data: { path: move.to } as never, overrideAccess: true, context: ctx })
      push({ kind: 'show', id: move.id, from: move.from, to: move.to, verdict: 'moved' })
    } catch (err) {
      push({ kind: 'show', id: move.id, from: move.from, to: move.to, verdict: 'failed', detail: err instanceof Error ? err.message : String(err) })
    }
  }
  return rows
}

export function summarizeMoves(rows: readonly MoveRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) out[`${r.kind} ${r.verdict}`] = (out[`${r.kind} ${r.verdict}`] ?? 0) + 1
  return out
}

export { SHOWS_PREFIX }
